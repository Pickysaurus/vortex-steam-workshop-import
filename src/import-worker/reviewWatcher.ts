import fs from 'fs';
import { ImportEvent } from '../types/importEvents';

export default class ReviewWatcher {
    private watcher: NodeJS.AsyncIterator<fs.promises.FileChangeInfo<string>, undefined, any>;
    private controller: AbortController;
    private sendFunc: (ev: ImportEvent) => void;

    constructor(path: string, send: (ev: ImportEvent<any>) => void) {
        this.sendFunc = send;
        this.controller = new AbortController();
        this.watcher = fs.promises.watch(path, { signal: this.controller.signal });

    }

    async run() {
        try {
            for await (const event of this.watcher) {
            
            }
        }
        catch(e: unknown) {
            if ((e as Error).name === 'AbortError') return;
            else this.sendFunc({
                type: 'fatal',
                error: `Unexpected error in review watcher ${(e as Error)?.message}`
            });
        }
    }

    dispose() {
        this.controller.abort();
    }
}