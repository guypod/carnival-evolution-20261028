import { createRegistry } from '../carnival';
import { balloonDarts } from './balloon-darts/game';
import { coasterWorkshop } from './coaster-workshop/game';
import { duckDash } from './duck-dash/game';
import { highStriker } from './high-striker/game';
import { memoryMenagerie } from './memory-menagerie/game';
import { miniPutt } from './mini-putt/game';
import { moleMayhem } from './mole-mayhem/game';
import { ringToss } from './ring-toss/game';
import { skeeBall } from './skee-ball/game';
import { waterCannon } from './water-cannon/game';

/** Every game on the midway. A new game is added to this list. */
export const registry = createRegistry([
  waterCannon,
  ringToss,
  moleMayhem,
  highStriker,
  balloonDarts,
  memoryMenagerie,
  duckDash,
  skeeBall,
  miniPutt,
  coasterWorkshop,
]);
