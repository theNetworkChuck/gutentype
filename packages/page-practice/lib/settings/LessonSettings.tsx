import {
  type BooksLesson,
  type CodeLesson,
  type CustomTextLesson,
  type GuidedLesson,
  type Lesson,
  lessonProps,
  LessonType,
  type NumbersLesson,
  type WordListLesson,
} from "@keybr/lesson";
import { LessonLoader } from "@keybr/lesson-loader";
import { type Settings, useSettings } from "@keybr/settings";
import { Tab, TabList } from "@keybr/widget";
import { type ReactNode } from "react";
import { useIntl } from "react-intl";
import { BooksLessonSettings } from "./lesson/BooksLessonSettings.tsx";
import { CodeLessonSettings } from "./lesson/CodeLessonSettings.tsx";
import { CustomTextLessonSettings } from "./lesson/CustomTextLessonSettings.tsx";
import { DailyGoalSettings } from "./lesson/DailyGoalSettings.tsx";
import { GuidedLessonSettings } from "./lesson/GuidedLessonSettings.tsx";
import { LessonPreview } from "./lesson/LessonPreview.tsx";
import { NumbersLessonSettings } from "./lesson/NumbersLessonSettings.tsx";
import { WordListLessonSettings } from "./lesson/WordListLessonSettings.tsx";

// Gutentype: only the scripture lesson and custom text are offered (ISC-68); the same list as @gutentype/lesson's
// offeredLessonTypes, where LessonLoader sends a saved profile on any other type back to the scripture lesson.
const offeredLessonTypes = [LessonType.GUIDED, LessonType.CUSTOM];

export function LessonSettings(): ReactNode {
  const { formatMessage } = useIntl();
  const { settings, updateSettings } = useSettings();
  return (
    <>
      <TabList
        selectedIndex={Math.max(
          0,
          offeredLessonTypes.indexOf(settings.get(lessonProps.type)),
        )}
        onSelect={(index) => {
          updateSettings(
            settings.set(lessonProps.type, offeredLessonTypes[index]),
          );
        }}
      >
        <Tab
          label={formatMessage({
            id: "t_Guided_lessons",
            defaultMessage: "Guided lessons",
          })}
        />
        <Tab
          label={formatMessage({
            id: "t_Custom_text",
            defaultMessage: "Custom text",
          })}
        />
      </TabList>
      <LessonLoader>
        {(lesson) => (
          <>
            {tabBody(settings, lesson)}
            <LessonPreview lesson={lesson} />
            <DailyGoalSettings />
          </>
        )}
      </LessonLoader>
    </>
  );
}

function tabBody(settings: Settings, lesson: Lesson): ReactNode {
  switch (settings.get(lessonProps.type)) {
    case LessonType.GUIDED:
      return <GuidedLessonSettings lesson={lesson as GuidedLesson} />;
    case LessonType.WORDLIST:
      return <WordListLessonSettings lesson={lesson as WordListLesson} />;
    case LessonType.BOOKS:
      return <BooksLessonSettings lesson={lesson as BooksLesson} />;
    case LessonType.CUSTOM:
      return <CustomTextLessonSettings lesson={lesson as CustomTextLesson} />;
    case LessonType.CODE:
      return <CodeLessonSettings lesson={lesson as CodeLesson} />;
    case LessonType.NUMBERS:
      return <NumbersLessonSettings lesson={lesson as NumbersLesson} />;
    default:
      throw new Error();
  }
}
