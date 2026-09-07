import { isModuleEnabled } from './modules';
import { initYafcModule } from './modules/yafc';

if (isModuleEnabled('yafc')) {
  initYafcModule();
}
