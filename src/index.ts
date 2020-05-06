import { actions, log, selectors, types } from 'vortex-api';
import * as path from 'path';
import WorkshopImport from './views/WorkshopImport';

const supportedGameIds = ['skyrim', 'ahatintime', 'enderal', 'darkestdungeon', 'dawnofman', 'divinityoriginalsin2', 'divinityoriginalsin2definitiveedition', 'faleanniversary', 'galacticcivilisations3', 'kenshi',
                          'kerbalspaceprogram', 'legendofgrimrock', 'mbwarband', 'neverwinternightsenhancededition', 'oxygennotincluded', 'payday2', 'pillarsofeternity2deadfire', 'portal2', 'prisonarchitect',
                          'rimworld', 'x4foundations' ];

function main(context: types.IExtensionContext) {
  // Abort for non-windows installs. 
  if (process.platform !== "win32") return false;

  // Register our import dialog
  context.registerDialog('workshop-import', WorkshopImport);

  // Add an import button to the mods tab.
  context.registerAction('mod-icons', 120, 'import', {}, 'Import From Steam Workshop', () => {
    context.api.store.dispatch(actions.setDialogVisible('workshop-import'));
  }, (instanceIds) => {
    // Make sure this is a game we know can have Steam Workshop
    const gameId = selectors.activeGameId(context.api.store.getState());
    return supportedGameIds.includes(gameId);
  });

  context.once(() => {
    // Import our custom styles
    context.api.setStylesheet('workshop-import', path.join(__dirname, 'workshop-import.scss'));
  });

  return true;
}

export default main;
