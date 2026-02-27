export type Voice = {
  name: string;
  gender: "male" | "female";
};

export const VOICES: Voice[] = [
  // Female voices
  { name: "Achernar", gender: "female" },
  { name: "Aoede", gender: "female" },
  { name: "Autonoe", gender: "female" },
  { name: "Callirrhoe", gender: "female" },
  { name: "Despina", gender: "female" },
  { name: "Erinome", gender: "female" },
  { name: "Gacrux", gender: "female" },
  { name: "Kore", gender: "female" },
  { name: "Laomedeia", gender: "female" },
  { name: "Leda", gender: "female" },
  { name: "Pulcherrima", gender: "female" },
  { name: "Sulafat", gender: "female" },
  { name: "Vindemiatrix", gender: "female" },
  { name: "Zephyr", gender: "female" },
  // Male voices
  { name: "Achird", gender: "male" },
  { name: "Algenib", gender: "male" },
  { name: "Algieba", gender: "male" },
  { name: "Alnilam", gender: "male" },
  { name: "Charon", gender: "male" },
  { name: "Enceladus", gender: "male" },
  { name: "Fenrir", gender: "male" },
  { name: "Iapetus", gender: "male" },
  { name: "Orus", gender: "male" },
  { name: "Puck", gender: "male" },
  { name: "Rasalgethi", gender: "male" },
  { name: "Sadachbia", gender: "male" },
  { name: "Sadaltager", gender: "male" },
  { name: "Schedar", gender: "male" },
  { name: "Umbriel", gender: "male" },
];

export const MALE_VOICES = VOICES.filter((v) => v.gender === "male");
export const FEMALE_VOICES = VOICES.filter((v) => v.gender === "female");

export type Model = {
  id: string;
  label: string;
  description: string;
};

export const MODELS: Model[] = [
  {
    id: "gemini-2.5-flash-tts",
    label: "Flash",
    description: "Low latency, fast generation",
  },
  {
    id: "gemini-2.5-flash-lite-preview-tts",
    label: "Flash Lite",
    description: "Lightweight preview model",
  },
  {
    id: "gemini-2.5-pro-tts",
    label: "Pro",
    description: "High control, best for long-form",
  },
];

export type StylePreset = {
  label: string;
  tag: string; // empty string = no tag injected
};

export const STYLE_PRESETS: StylePreset[] = [
  { label: "Neutral", tag: "" },
  { label: "Whispering", tag: "[whispering]" },
  { label: "Sarcastic", tag: "[sarcasm]" },
  { label: "Laughing", tag: "[laughing]" },
  { label: "Shouting", tag: "[shouting]" },
  { label: "Robotic", tag: "[robotic]" },
  { label: "Extremely Fast", tag: "[extremely fast]" },
];
