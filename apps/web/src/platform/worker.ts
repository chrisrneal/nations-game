import { expose } from 'comlink';
import { WarehouseEngine } from './engine.ts';

/** The Web Worker: the sim and the clock run here, off the interface thread. */
expose(new WarehouseEngine());
