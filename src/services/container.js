import { usersRepo } from '../db/repositories/users.repo.js';
import { tenantsRepo } from '../db/repositories/tenants.repo.js';
import { sessionsRepo } from '../db/repositories/sessions.repo.js';
import { kuihRepo } from '../db/repositories/kuih.repo.js';
import { ingredientsRepo } from '../db/repositories/ingredients.repo.js';
import { recipesRepo } from '../db/repositories/recipes.repo.js';
import { ordersRepo } from '../db/repositories/orders.repo.js';
import { auditRepo } from '../db/repositories/audit.repo.js';
import { settingsRepo } from '../db/repositories/settings.repo.js';

import { authService } from './auth.service.js';
import { catalogService } from './catalog.service.js';
import { ordersService } from './orders.service.js';
import { dashboardService } from './dashboard.service.js';
import { platformService } from './platform.service.js';
import { assistantService } from './assistant.service.js';

/**
 * Satu tempat untuk memasang repositori + servis.
 * Menukar pemacu pangkalan data tidak menjejaskan lapisan ini.
 */
export function buildContainer(db) {
  const repos = {
    users: usersRepo(db),
    tenants: tenantsRepo(db),
    sessions: sessionsRepo(db),
    kuih: kuihRepo(db),
    ingredients: ingredientsRepo(db),
    recipes: recipesRepo(db),
    orders: ordersRepo(db),
    audit: auditRepo(db),
    settings: settingsRepo(db)
  };

  const audit = repos.audit;
  const settings = repos.settings;

  const services = {
    auth: authService({ repos }),
    catalog: catalogService({ repos, audit }),
    orders: ordersService({ repos, audit }),
    dashboard: dashboardService({ repos, settings }),
    platform: platformService({ repos, settings, audit }),
    assistant: assistantService({ repos, settings })
  };

  return { db, repos, services, audit, settings };
}
