import { actions, selectors, types } from 'vortex-api';
import * as path from 'path';
import WorkshopImport from './views/SteamWorkshopImport';

function main(context: types.IExtensionContext) {
  // Abort for non-windows installs. 
  if (process.platform !== "win32") return false;

  // Register our import dialog
  context.registerDialog('workshop-import-2', WorkshopImport);

  // Add an import button to the mods tab.
  context.registerAction('mod-icons', 120, 'import', {}, 'Import From Steam Workshop (NEW)', () => {
    context.api.store.dispatch(actions.setDialogVisible('workshop-import-2'));
  }, () => {
    // Make sure this is a game we know can have Steam Workshop
    // If the game extension doesn't include the Steam App ID, we won't show it.
    const state = context.api.getState();
    const gameId = selectors.activeGameId(state);
    const game = selectors.gameById(state, gameId);
    const steamAppId = game?.details?.steamAppId;
    return !!steamAppId;
  });

  context.once(() => {
    // Import our custom styles
    context.api.setStylesheet('workshop-import', path.join(__dirname, 'workshop-import.scss'));
  });

  return true;
}

export default main;
