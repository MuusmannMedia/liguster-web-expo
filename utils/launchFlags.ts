// utils/launchFlags.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const K_FIRST_LAUNCH_DONE = "lig:firstLaunchDone";
const K_PUSH_ASKED       = "lig:pushAsked";
const K_PUSH_NUDGED_AT   = "lig:pushNudgedAt"; // ms timestamp for sidste nudge

export async function getFirstLaunchDone(): Promise<boolean> {
  return (await AsyncStorage.getItem(K_FIRST_LAUNCH_DONE)) === "1";
}
export async function setFirstLaunchDone(): Promise<void> {
  await AsyncStorage.setItem(K_FIRST_LAUNCH_DONE, "1");
}

export async function getPushAsked(): Promise<boolean> {
  return (await AsyncStorage.getItem(K_PUSH_ASKED)) === "1";
}
export async function setPushAsked(): Promise<void> {
  await AsyncStorage.setItem(K_PUSH_ASKED, "1");
}

/** Returnér true hvis vi MÅ vise nudgen (aldrig vist før eller ældre end N dage) */
export async function isPushNudgeDue(days = 7): Promise<boolean> {
  const raw = await AsyncStorage.getItem(K_PUSH_NUDGED_AT);
  if (!raw) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  const ms = days * 24 * 60 * 60 * 1000;
  return Date.now() - last >= ms;
}
export async function setPushNudgedNow(): Promise<void> {
  await AsyncStorage.setItem(K_PUSH_NUDGED_AT, String(Date.now()));
}