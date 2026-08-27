import { normalizeNewlines } from "@/app/utils";

const ASS_EVENTS_HEADER = `[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

export const bilingualAssHdrTemplate = `[Script Info]
Title: Converted Subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080
Timer: 100

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Chs,Source Han Sans SC ST Medium,62,&H00878787,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,8,134
Style: Eng,Source Han Sans SC ST Medium,38,&H00527782,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,10,134
Style: Tip,Source Han Sans SC ST Medium,50,&H00878787,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,8,5,5,0,134`;

export const bilingualAssSdrTemplate = `[Script Info]
Title: Converted Subtitle
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080
Timer: 100

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Chs,Source Han Sans SC ST Medium,62,&H00A5A5A5,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,8,134
Style: Eng,Source Han Sans SC ST Medium,38,&H005C859F,&H000000FF,&H00000000,&H00000000,0,0,0,0,90,100,0,0,1,1,1,2,10,10,10,134
Style: Tip,Source Han Sans SC ST Medium,50,&H00A5A5A5,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,1,8,5,5,0,134`;

export const ensureAssTemplateHasEvents = (template: string): string => {
  const normalized = normalizeNewlines(template).trim();
  if (!/\[Events\]/i.test(normalized)) {
    return `${normalized}\n\n${ASS_EVENTS_HEADER}`;
  }
  if (!/^Format:\s*Layer,\s*Start,\s*End,\s*Style,\s*Name,\s*MarginL,\s*MarginR,\s*MarginV,\s*Effect,\s*Text\s*$/im.test(normalized)) {
    return normalized.replace(/\[Events\]/i, ASS_EVENTS_HEADER);
  }
  return normalized;
};

