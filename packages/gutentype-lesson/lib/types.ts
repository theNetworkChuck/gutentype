import { LessonType } from "@keybr/lesson";

/** The lesson types Learn offers (ISC-68): the scripture lesson (Keybr's guided slot) and the person's own text. */
export const offeredLessonTypes: readonly LessonType[] = [
  LessonType.GUIDED,
  LessonType.CUSTOM,
];

/** A saved profile pointing at a type Learn no longer offers falls back to the scripture lesson. */
export function offeredLessonType(type: LessonType): LessonType {
  return offeredLessonTypes.includes(type) ? type : LessonType.GUIDED;
}
