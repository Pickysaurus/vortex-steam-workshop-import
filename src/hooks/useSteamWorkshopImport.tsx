import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSelector, useStore } from "react-redux";
import { actions, MainContext, selectors, types, log } from "vortex-api";
import { ISteamWorkshopEntry } from "../types/workshopEntries";
import { defaultImportProgress, ImportProgressProps } from "../views/ProgressBar";
import { createImportService } from '../util/importServiceHandler';
import { ImportEvent } from "../types/importEvents";
import { LogLevel } from "vortex-api/lib/util/log";

type TableState = 'loading' | 'importing' | 'ready' | 'review';

interface IImportError {
    title: string;
    detail: string;
}

export default function useSteamWorkshopImport(visible: boolean) {
    const context = useContext(MainContext);
    const store = useStore();

    const [scanResults, setScanResults] = useState<Record<string, ISteamWorkshopEntry> | undefined>(undefined);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [progress, setProgress] = useState<ImportProgressProps>(defaultImportProgress);
    const [error, setError] = useState<IImportError>();
    const [tableState, setTableState] = useState<TableState>('loading');
    const [createArchives, setCreateArchives] = useState(true);
    const [workshopPath, setWorkshopPath] = useState<string>();

    const stagingFolder: string = useSelector((state: types.IState) => selectors.installPath(state));
    const downloadFolder: string = useSelector((state: types.IState) => selectors.downloadPath(state));
    const networkConnected: boolean = useSelector((state: types.IState) => state.session.base.networkConnected);

    const gameId = useSelector((state: types.IState) => selectors.activeGameId(state));
    const discoveryPath = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        return state.settings.gameMode.discovered?.[gameId]?.path
    });
    const mods = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        return state.persistent.mods?.[gameId] || {};
    });
    const steamAppId = useSelector((state: types.IState) => {
        const gameId = selectors.activeGameId(state);
        const game = selectors.gameById(state, gameId);
        return game.details?.steamAppId;
    })
    const profile: types.IProfile | undefined = useSelector((state: types.IState) => selectors.activeProfile(state));

    const serviceRef = useRef<ReturnType<typeof createImportService> | null>(null);

    const activeStateRef = useRef({ gameId, discoveryPath, stagingFolder, downloadFolder, steamAppId });

    useEffect(() => {
        activeStateRef.current = { gameId, discoveryPath, stagingFolder, downloadFolder, steamAppId };
    }, [gameId, discoveryPath, stagingFolder, downloadFolder, steamAppId]);

    const addMod = useCallback((mod: types.IMod, gameId: string) => {
        store.dispatch(
            actions.addMod(gameId, mod)
        );
    }, []);

    const addLocalDownload = useCallback((archiveId: string, gameId: string, filePath: string, size: number) => {
        store.dispatch(
            actions.addLocalDownload(archiveId, gameId, filePath, size)
        );
    }, []);

    const setDownloadModInfo = useCallback((archiveId: string, key: string, value: string) => {
        store.dispatch(
            actions.setDownloadModInfo(archiveId, key, value)
        );
    }, []);

    const enableProfileMod = useCallback((modId: string) => {
        if (!profile) return;
        store.dispatch(
            actions.setModEnabled(profile.id, modId, true)
        )
    }, []);

    const setDeploymentRequired = useCallback(() => {
        if (!profile) return;
        store.dispatch(
            actions.setDeploymentNecessary(gameId, true)
        )
    }, [ gameId ]);

    const toggleReviewMode = useCallback((enable: boolean) => {
        serviceRef.current?.toggleReviewWatcher(enable, workshopPath);
    }, [ workshopPath ]);

    // Service Handler
    const handleEvent = useCallback((ev: ImportEvent<types.IMod, LogLevel>) => {
        const { gameId: currentGameId } = activeStateRef.current; 
        console.log('Steam Workshop Import Event triggered', ev);
        switch(ev.type) {
            case 'scancomplete':
                setTableState('ready');
                setWorkshopPath(ev.workshopPath);
                if (ev.total === 0) setScanResults({});
                else setScanResults(ev.mods);
                if (ev.errors?.length) setError({
                    title: 'Scan encountered errors',
                    detail: ev.errors.join('\n')
                });
                break;
            case 'importprogress': 
                setProgress({ 
                    message: ev.message, 
                    done: ev.done,
                    total: ev.total,
                    detail: ev.detail ?? ''
                });
                break;
            case 'importedmod': 
                // Save this newly created mod ready for a batch insert
                if (ev.mod.archiveId) {
                    const { attributes, archiveId } = ev.mod;
                    const { fileSize,  fileName, version, logicalFileName } = attributes!;
                    addLocalDownload(archiveId, currentGameId, fileName!, fileSize || 0);
                    setDownloadModInfo(archiveId, 'name', logicalFileName!);
                    setDownloadModInfo(archiveId, 'version', version!);
                    setDownloadModInfo(archiveId, 'game', currentGameId);

                }
                addMod(ev.mod, currentGameId);
                enableProfileMod(ev.mod.id);
                break;
            case 'importcomplete': 
                setProgress(p => ({
                    ...p, 
                    state: ev.errors.length ? 'error' : 'success', 
                    total: ev.total, 
                    done: ev.total, 
                    message: `Import complete${ev.errors.length ? ' with errors' : ''}`,
                    detail: ''
                }));
                setTableState('review');
                toggleReviewMode(true);
                // Turn back on the download watcher
                context.api.events.emit('enable-download-watch', true);
                // setSelected(new Set());
                if (ev.successful > 0) setDeploymentRequired();
                if (ev.errors?.length) setError({
                    title: 'Import encountered errors',
                    detail: ev.errors.join('\n\n')
                });
                break;
            case 'fatal':
                setError({title: 'Worker error', detail: ev.error });
                setTableState('ready');
                setProgress(prev => ({...prev, state: 'error'}));
                break;
            case 'message':
                log(ev.level, ev.message, ev.metadata);
                break;
            case 'exit':
                log('debug', 'Steam Workshop import child process exited with code: '+ev.code);
                break;
            case 'modremoved':
                const { id } = ev;
                if (id) {
                    setSelected(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }
                break;
            default: log('warn', `Unknown Steam Workshop Import Event: ${JSON.stringify(ev satisfies never)}`);         
        }
    }, [addMod, addLocalDownload, setDownloadModInfo, enableProfileMod, setDeploymentRequired, toggleReviewMode]);

    useEffect(() => {
        if (!visible) return;

        const svc = createImportService();
        serviceRef.current = svc;

        const off = svc.onEvent(handleEvent);

        startScan();

        return () => {
            svc?.toggleReviewWatcher(false);
            off();
            svc.dispose();
            serviceRef.current = null;
            setProgress(defaultImportProgress);
            context.api.events.emit('enable-download-watch', true);
        };
    }, [visible, handleEvent]);

    
    // Event callbacks
    const startScan = useCallback(() => {
        if (!discoveryPath || !steamAppId) return;
        if (!networkConnected) {
            setTableState('ready');
            setScanResults({});
            setError({ title: 'Offline', detail: 'You must be connected to the internet to use this feature.' });
            return;
        }
        setScanResults(undefined);
        setProgress((p) => ({...p, state: 'running'}));
        setError(undefined);
        setTableState('loading');
        serviceRef.current?.scan(discoveryPath, steamAppId);
    }, [ networkConnected, discoveryPath, steamAppId ]);

    const startImport = useCallback(() => {
        setProgress((p) => ({...p, state: 'running'}));
        setError(undefined);
        setTableState('importing');
        // Turn off the download watcher so we can import downloads in peace!
        context.api.events.emit('enable-download-watch', false);
        if (!discoveryPath || !selected.size) return;
        serviceRef.current?.import(
            [...selected], 
            discoveryPath, 
            gameId,
            steamAppId,
            stagingFolder,
            downloadFolder,
            createArchives
        );
    }, [ discoveryPath, selected, gameId, steamAppId, stagingFolder, downloadFolder, createArchives ]);

    const manuallyDeleteMod = useCallback((modId: string) => {
        serviceRef.current?.deleteMod(workshopPath, modId);
    }, [ workshopPath ]);

    const cancel = useCallback(() => {
        serviceRef.current?.cancel();
    }, []);

    return {
        networkConnected,
        workshopPath,
        mods,
        scanResults,
        selected,
        setSelected,
        progress,
        error,
        tableState,
        createArchives,
        setCreateArchives,
        startScan,
        startImport,
        toggleReviewMode,
        manuallyDeleteMod,
        cancel
    }    
}