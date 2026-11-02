import {
  loadLearnCorpus,
  offeredLessonType,
  packModel,
  ScriptureLesson,
} from "@gutentype/lesson";
import { loadContent } from "@keybr/content-books";
import { loadWordList } from "@keybr/content-words";
import { catchError } from "@keybr/debug";
import { KeyboardOptions, useKeyboard } from "@keybr/keyboard";
import {
  BooksLesson,
  CodeLesson,
  CustomTextLesson,
  type Lesson,
  lessonProps,
  LessonType,
  NumbersLesson,
  WordListLesson,
} from "@keybr/lesson";
import { LoadingProgress } from "@keybr/pages-shared";
import { type PhoneticModel } from "@keybr/phonetic-model";
import { PhoneticModelLoader } from "@keybr/phonetic-model-loader";
import { useSettings } from "@keybr/settings";
import { type ReactNode, useEffect, useState } from "react";

export function LessonLoader({
  children,
  fallback = <LoadingProgress />,
}: {
  readonly children: (result: Lesson) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const { settings, updateSettings } = useSettings();
  // Gutentype: Learn offers only the scripture lesson and custom text (ISC-68); a saved profile on any other
  // lesson type falls back to the scripture lesson.
  const savedType = settings.get(lessonProps.type);
  const lessonType = offeredLessonType(savedType);
  useEffect(() => {
    if (lessonType !== savedType) {
      updateSettings(settings.set(lessonProps.type, lessonType));
    }
  }, [settings, updateSettings, savedType, lessonType]);
  const { language } = KeyboardOptions.from(settings);
  return (
    <PhoneticModelLoader language={language}>
      {(model) => (
        <Loader key={lessonType.id} model={model} fallback={fallback}>
          {children}
        </Loader>
      )}
    </PhoneticModelLoader>
  );
}

function Loader({
  model,
  children,
  fallback,
}: {
  readonly model: PhoneticModel;
  readonly children: (result: Lesson) => ReactNode;
  readonly fallback?: ReactNode;
}): ReactNode {
  const result = useLoader(model);
  if (result == null) {
    return fallback;
  } else {
    return children(result);
  }
}

function useLoader(model: PhoneticModel): Lesson | null {
  const { settings } = useSettings();
  const keyboard = useKeyboard();
  const [result, setResult] = useState<Lesson | null>(null);

  useEffect(() => {
    let didCancel = false;

    const load = async (): Promise<void> => {
      switch (offeredLessonType(settings.get(lessonProps.type))) {
        case LessonType.GUIDED: {
          // Gutentype: the scripture lesson on the active pack. The pack model is built here because
          // PhoneticModelLoader is keyed by language only.
          const corpus = await loadLearnCorpus(settings);
          if (!didCancel) {
            setResult(
              new ScriptureLesson(
                settings,
                keyboard,
                packModel(model, corpus.pack),
                corpus,
              ),
            );
          }
          break;
        }
        case LessonType.WORDLIST: {
          const { language } = KeyboardOptions.from(settings);
          const wordList = await loadWordList(language);
          if (!didCancel) {
            setResult(new WordListLesson(settings, keyboard, model, wordList));
          }
          break;
        }
        case LessonType.BOOKS: {
          const book = settings.get(lessonProps.books.book);
          const content = await loadContent(book);
          if (!didCancel) {
            setResult(
              new BooksLesson(settings, keyboard, model, { book, content }),
            );
          }
          break;
        }
        case LessonType.CUSTOM: {
          if (!didCancel) {
            setResult(new CustomTextLesson(settings, keyboard, model));
          }
          break;
        }
        case LessonType.CODE: {
          if (!didCancel) {
            setResult(new CodeLesson(settings, keyboard, model));
          }
          break;
        }
        case LessonType.NUMBERS: {
          if (!didCancel) {
            setResult(new NumbersLesson(settings, keyboard, model));
          }
          break;
        }
        default:
          throw new Error();
      }
    };

    load().catch(catchError);

    return () => {
      didCancel = true;
    };
  }, [settings, keyboard, model]);

  return result;
}
