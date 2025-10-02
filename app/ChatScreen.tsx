// app/ChatScreen.tsx
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';
import { supabase } from '../utils/supabase';

type Message = {
  id: string;
  thread_id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  post_id: string | null;
  created_at: string;
};

export default function ChatScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { threadId, postId, otherUserId } = route.params || {};

  const { width, height } = useWindowDimensions();
  const isTablet =
    (Platform.OS === 'ios' && // @ts-ignore
      (Platform as any).isPad) || Math.min(width, height) >= 768;

  // Responsive sizes
  const S = {
    avatar: isTablet ? 46 : 40,
    header: isTablet ? 22 : 18,
    bubbleText: isTablet ? 17 : 15,
    time: isTablet ? 12 : 11,
    inputFont: isTablet ? 18 : 16,
    bubblePadV: isTablet ? 14 : 12,
    bubblePadH: isTablet ? 18 : 16,
    rowPadH: isTablet ? 16 : 12,
    bubbleMaxWidthPct: isTablet ? 0.68 : 0.76, // lidt bredere bobler på tablet
  };

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [postTitle, setPostTitle] = useState('UKENDT OPSLAG');
  const [loading, setLoading] = useState(true);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [emails, setEmails] = useState<Record<string, string | null>>({});

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data?.user?.id || null));
  }, []);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;

    const run = async () => {
      setLoading(true);

      const { data: msgs, error } = await supabase
        .from('messages')
        .select('id,thread_id,sender_id,receiver_id,text,post_id,created_at,posts!left(overskrift)')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.warn('Load messages error:', error.message);
        setMessages([]);
      } else {
        const rows = (msgs || []) as any[];
        setMessages(rows);

        // Titel
        let title: string | undefined = rows.find((m) => m.posts?.overskrift)?.posts?.overskrift;
        if (!title) {
          const realPostId = postId || rows[0]?.post_id;
          if (realPostId) {
            const { data: p } = await supabase
              .from('posts')
              .select('overskrift')
              .eq('id', realPostId)
              .maybeSingle();
            if (p?.overskrift) title = p.overskrift;
          }
        }
        setPostTitle(title || 'UKENDT OPSLAG');

        // Avatars + emails
        const uniqIds = Array.from(
          new Set<string>(
            rows
              .flatMap((m) => [m.sender_id, m.receiver_id])
              .concat(userId || '', otherUserId || '')
              .filter(Boolean),
          )
        );

        if (uniqIds.length) {
          const { data: usersData } = await supabase
            .from('users')
            .select('id, avatar_url, email')
            .in('id', uniqIds);

          const a: Record<string, string | null> = {};
          const e: Record<string, string | null> = {};
          for (const u of usersData || []) {
            e[u.id] = u.email ?? null;
            if (u.avatar_url) {
              const { data: urlObj } = supabase.storage.from('avatars').getPublicUrl(u.avatar_url);
              a[u.id] = urlObj?.publicUrl || null;
            } else {
              a[u.id] = null;
            }
          }
          setAvatars(a);
          setEmails(e);
        }
      }

      setLoading(false);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [threadId, postId, userId, otherUserId]);

  // Realtime kun for denne tråd
  useEffect(() => {
    if (!threadId) return;

    const channel = supabase
      .channel(`messages:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const next = [...prev, row].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            return next;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  useEffect(() => {
    flatListRef.current?.scrollToEnd?.({ animated: true });
  }, [messages.length]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !userId || !threadId || !otherUserId) return;

    const tempId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      thread_id: threadId,
      sender_id: userId,
      receiver_id: otherUserId,
      text,
      post_id: postId || null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput('');

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        thread_id: threadId,
        sender_id: userId,
        receiver_id: otherUserId,
        text,
        post_id: postId || null,
      })
      .select()
      .single();

    if (error || !inserted) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert('Fejl', error?.message ?? 'Kunne ikke sende beskeden.');
      return;
    }

    setMessages((prev) => {
      if (prev.some((m) => m.id === inserted.id)) {
        return prev.filter((m) => m.id !== tempId);
      }
      return prev.map((m) => (m.id === tempId ? inserted : m));
    });

    setTimeout(() => flatListRef.current?.scrollToEnd?.({ animated: true }), 120);
  };

  const handleLongPressDelete = (message: Message) => {
    if (!userId) return;
    if (message.sender_id !== userId) return;

    Alert.alert(
      'Slet besked?',
      'Denne handling kan ikke fortrydes.',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.from('messages').delete().eq('id', message.id);
            if (error) {
              Alert.alert('Fejl', error.message);
              return;
            }
            setMessages((prev) => prev.filter((m) => m.id !== message.id));
          },
        },
      ],
      { cancelable: true }
    );
  };

  const getInitial = (uid: string | null) => {
    if (!uid) return 'U';
    const email = emails[uid];
    if (email && email.length > 0) return email[0]!.toUpperCase();
    return 'U';
  };

  const AvatarView = ({ uid }: { uid: string }) =>
    avatars[uid] ? (
      <Image source={{ uri: avatars[uid] as string }} style={{ width: S.avatar, height: S.avatar, borderRadius: S.avatar / 2, marginHorizontal: 6, backgroundColor: '#ddd' }} />
    ) : (
      <View style={{ width: S.avatar, height: S.avatar, borderRadius: S.avatar / 2, marginHorizontal: 6, backgroundColor: '#6337c4', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: isTablet ? 24 : 22 }}>
          {getInitial(uid)}
        </Text>
      </View>
    );

  return (
    <View style={styles.root}>
      {/* Topbar */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={[styles.header, { fontSize: S.header }]} numberOfLines={2}>
            {postTitle ? postTitle.toUpperCase() : 'UKENDT OPSLAG'}
          </Text>
        </View>

        <View style={{ width: 34 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 18 }}>Indlæser...</Text>
          </View>
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item: any) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 18, paddingTop: 12 }}
              renderItem={({ item }: { item: Message }) => {
                const isMe = item.sender_id === userId;
                return (
                  <View
                    style={[
                      styles.row,
                      { paddingHorizontal: S.rowPadH },
                      isMe ? styles.rowRight : styles.rowLeft,
                    ]}
                  >
                    {!isMe && <AvatarView uid={item.sender_id} />}

                    <View style={{ maxWidth: `${S.bubbleMaxWidthPct * 100}%`, flexShrink: 1 }}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        delayLongPress={350}
                        onLongPress={() => handleLongPressDelete(item)}
                        style={[
                          styles.bubble,
                          {
                            paddingVertical: S.bubblePadV,
                            paddingHorizontal: S.bubblePadH,
                          },
                          isMe ? styles.bubbleRight : styles.bubbleLeft,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bubbleText,
                            { fontSize: S.bubbleText, lineHeight: S.bubbleText + 5 },
                            isMe && { color: '#fff' },
                          ]}
                        >
                          {item.text}
                        </Text>
                      </TouchableOpacity>
                      <Text
                        style={[
                          styles.time,
                          { fontSize: S.time },
                          isMe ? styles.timeRight : styles.timeLeft,
                        ]}
                      >
                        {new Date(item.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>

                    {isMe && userId && <AvatarView uid={userId} />}
                  </View>
                );
              }}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd?.({ animated: true })}
              onScrollBeginDrag={() => Keyboard.dismiss()}
              keyboardShouldPersistTaps="handled"
            />
          </TouchableWithoutFeedback>
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            style={[styles.input, { fontSize: S.inputFont, minHeight: isTablet ? 48 : 44, maxHeight: isTablet ? 140 : 120 }]}
            placeholder="Skriv en besked…"
            placeholderTextColor="#999"
            multiline
            blurOnSubmit={false}
            returnKeyType={Platform.OS === 'ios' ? 'default' : 'none'}
            textAlignVertical="top"
          />
          <TouchableOpacity onPress={handleSend} style={styles.sendBtn}>
            <Text style={[styles.sendBtnText, { fontSize: isTablet ? 18 : 17 }]}>SEND</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#7C8996',
    paddingTop: 42,
  },

  /* Topbar */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 8,
    minHeight: 48,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#131921',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 15,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    textTransform: 'uppercase',
    paddingHorizontal: 2,
    flexWrap: 'wrap',
  },

  /* Rækker */
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },

  /* Boble (fælles) */
  bubble: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  bubbleRight: { backgroundColor: '#131921' },
  bubbleLeft: { backgroundColor: '#fff' },

  bubbleText: {
    color: '#222',
    flexShrink: 1,
    flexWrap: 'wrap',
  },

  time: {
    color: '#a1a1a1',
    marginTop: 4,
  },
  timeLeft: { alignSelf: 'flex-start', marginLeft: 6 },
  timeRight: { alignSelf: 'flex-end', marginRight: 6 },

  /* Input */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131921',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginRight: 9,
    color: '#1e2330',
    textAlignVertical: 'top',
  },
  sendBtn: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
    minHeight: 44,
  },
  sendBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});