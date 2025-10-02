import React, { useState } from "react";
import { sendForeningMessage } from "@/lib/foreningApi";

export default function ForeningMessages({ foreningId, messages, onNewMessage }) {
  const [text, setText] = useState("");

  const handleSend = async () => {
    if (!text.trim()) return;
    const msg = await sendForeningMessage(foreningId, text);
    onNewMessage(msg);
    setText("");
  };

  return (
    <div>
      <h2>Beskeder</h2>
      {messages.length === 0 ? (
        <p>Ingen beskeder endnu.</p>
      ) : (
        messages.map((msg) => <p key={msg.id}>{msg.text}</p>)
      )}
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv en besked..." />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}