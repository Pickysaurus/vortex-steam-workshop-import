import path from 'path';
import { fork, ChildProcess, MessageOptions, SendHandle } from "child_process";
import { ImportEvent as BaseImportEvent, ImportMessage } from '../types/importEvents';
import { types } from 'vortex-api';
import { LogLevel } from 'vortex-api/lib/util/log';

interface TypedChildProcess extends ChildProcess {
    send(message: ImportMessage, callback?: (error: Error | null) => void): boolean;
    send(message: ImportMessage, callback?: (error: Error | null) => void): boolean;
        send(message: ImportMessage, sendHandle?: SendHandle, callback?: (error: Error | null) => void): boolean;
        send(
            message: ImportMessage,
            sendHandle?: SendHandle,
            options?: MessageOptions,
            callback?: (error: Error | null) => void,
        ): boolean;
}

type ImportEvent = BaseImportEvent<types.IMod, LogLevel>;

export function createImportService() {
    let child: ChildProcess | null = null;
    const listeners = new Set<(ev: ImportEvent) => void>();

    const emit = (ev: ImportEvent) => {
        for (const fn of listeners) fn(ev);
    };

    function ensureChildProcess(): TypedChildProcess {
        if (child) return child;

        const script = path.join(__dirname, "importWorker.js");
        child = fork(script, [], { stdio: ["pipe", "pipe", "pipe", "ipc"] }) as TypedChildProcess;

        child.on('message', (ev: ImportEvent) => emit(ev));
        child.on('error', (err) => emit({ type: 'fatal', error: String(err) }));
        child.on('exit', (code) => {
            emit({ type: 'exit', code });
            child = null;
        });

        // Debuging 
        child.on('disconnect', () => emit({ type: 'message', level: 'warn', message: 'Disconnected' }));
        child.on('spawn', () => emit({ type: 'message', level: 'debug', message: `Child spawned: ${child?.pid}` }));

        child.stdout?.on('data', (d) => emit({ type: 'message', level: 'debug', message:`[child stdout] ${d.toString()}`}))
        child.stderr?.on('data', (d) => emit({ type: 'fatal', error:`[child stderr] ${d.toString()}`}));

        return child;
    }

    return {
        onEvent(fn: (ev: ImportEvent) => void) {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },

        scan(gamePath: string, steamAppId: number) {
            ensureChildProcess().send({ type: 'scan', gamePath, steamAppId });
        },

        import(
            importIds: string[], gamePath: string, gameId: string, steamAppId: number,
            stagingFolder: string, downloadFolder: string, 
            createArchives: boolean
        ) {
            ensureChildProcess().send(
                { 
                    type: 'import', 
                    importIds, gamePath, gameId, 
                    steamAppId, stagingFolder, 
                    downloadFolder, createArchives
                });
        },

        
        toggleReviewWatcher(enabled: boolean, workshopPath?: string) {
            ensureChildProcess().send({ type: 'review', enabled, workshopPath });
        },

        deleteMod(workshopPath: string, modId: string) {
            ensureChildProcess().send({ type: 'delete', workshopPath, modId });
        },
        
        cancel() {
            child?.send({ type: 'cancel' });
        },

        dispose() {
            child?.kill();
            child = null;
            listeners.clear();
        }
    }
}