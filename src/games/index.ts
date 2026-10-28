import { createRegistry } from '../carnival';
import { highStriker } from './high-striker/game';
import { moleMayhem } from './mole-mayhem/game';
import { ringToss } from './ring-toss/game';
import { waterCannon } from './water-cannon/game';

/** Every game on the midway. A new game is added to this list. */
export const registry = createRegistry([waterCannon, ringToss, moleMayhem, highStriker]);
