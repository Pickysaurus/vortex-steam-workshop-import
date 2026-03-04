import fs from 'fs';
import { ImportEvent } from '../types/importEvents';
import path from 'path';

export default class ReviewWatcher {
    public watchPath: string;
    private watcher: NodeJS.AsyncIterator<fs.promises.FileChangeInfo<string>, undefined, any>;
    private controller: AbortController;
    private sendFunc: (ev: ImportEvent) => void;
    private baseFolders = new Set();

    constructor(path: string, send: (ev: ImportEvent<any>) => void) {
        if (!path.toLowerCase().includes('workshop')) throw new Error('Invalid Workshop Path');
        this.watchPath = path;
        this.sendFunc = send;
        this.controller = new AbortController();
        this.watcher = fs.promises.watch(path, { signal: this.controller.signal, recursive: false });

    }

    async run() {
        try {
            const dir = await fs.promises.readdir(this.watchPath);
            this.baseFolders = new Set(dir.filter(e => !path.extname(e)));
            this.sendFunc({ type: 'message', level: 'debug', message: `Initial folders in directory: ${[...this.baseFolders].join(', ')}` });
            for await (const event of this.watcher) {
                const { filename, eventType } = event;

                if (eventType !== 'rename' || !filename) continue;
                
                const fullPath = path.join(this.watchPath, filename);

                const exists = fs.existsSync(fullPath);

                if (!exists && this.baseFolders.has(filename)) {
                    this.sendFunc({
                        type: 'modremoved',
                        id: filename
                    });
                    this.baseFolders.delete(filename);
                }
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