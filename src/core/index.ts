export { IDLE_CAP, matches } from './match';
export { prepare, segment, wc, type Prepared, type Section } from './text';
export {
  Session,
  series,
  type BackspaceEvent,
  type CharState,
  type KeyEvent,
  type LogEvent,
  type SessionStats,
} from './session';
export {
  addProfiles,
  analyze,
  charClass,
  emptyProfile,
  hint,
  mergeProfile,
  type Analysis,
  type Profile,
} from './analysis';
export {
  assembleChapters,
  chapterOf,
  chapterRange,
  type Book,
  type BookSource,
  type Chapter,
  type RawChapter,
} from './book';
export { findRare, isTypable, replaceRare, replacementFor, type RareChar } from './rare';
export { cleanParagraph, normalize } from './text';
export {
  coverStyle,
  coverSvg,
  DEFAULT_LAYOUTS,
  isCoverChoice,
  LAYOUT_NAMES,
  LAYOUTS,
  PALETTES,
  randomCover,
  type CoverChoice,
  type Layout,
} from './cover';
export {
  adjacent,
  areNeighbors,
  FINGER_NAMES,
  HAND_NAMES,
  KEYS,
  keyOf,
  neighbors,
  SPACE,
  strokesFor,
  type Finger,
  type Hand,
  type Key,
  type Row,
  type Stroke,
} from './keyboard';
export { classifyErrors, countErrorKinds, ERROR_KIND_NAMES, type ClassifiedError, type ErrorKind } from './errors';
