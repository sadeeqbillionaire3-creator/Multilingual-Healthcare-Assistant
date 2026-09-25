export const analyticStore = {
  totalMessages: 0,
  chatsToday: 0,
  emergencyCount: 0,
  languages: {
    en: 0,
    ha: 0,
    fr: 0,
    ar: 0,
    yo: 0,
    ig: 0,
    pcm: 0
  } as Record<string, number>,
  lastReset: new Date().toDateString(),
  recent: [] as { lang: string; isEmergency: boolean; message: string; time: string }[],
};

export function logChat(data: { lang: string; isEmergency: boolean; message: string }) {
  const today = new Date().toDateString();
  if (today !== analyticStore.lastReset) {
    analyticStore.chatsToday = 0;
    analyticStore.lastReset = today;
  }
  analyticStore.totalMessages++;
  analyticStore.chatsToday++;
  if (data.isEmergency) analyticStore.emergencyCount++;
  if (analyticStore.languages[data.lang] !== undefined) {
    analyticStore.languages[data.lang]++;
  }
  analyticStore.recent.unshift({ ...data, time: new Date().toISOString() });
  if (analyticStore.recent.length > 30) analyticStore.recent.pop();
}