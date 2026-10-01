import { expose } from 'comlink';
import { AirportEngine } from './engine.ts';

/** The Web Worker: the sim and the clock run here, off the interface thread. */
expose(new AirportEngine());
