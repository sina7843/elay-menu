import type { FastifyInstance } from 'fastify';
import { ObjectId } from 'mongodb';
import { ObjectIdSchema, type AdminFoodcourt, type AdminStall } from '@elay/shared';
import { requireRole, requireStallAccess } from '../auth/guards.js';
import { notFound, parse } from '../errors.js';
import { mediaUrl } from '../media.js';

// DRAGON-00 exposes only read endpoints needed to exercise the role/ownership guards.
// Mutations and the remaining admin contract arrive in DRAGON-01.
export async function adminRoutes(app: FastifyInstance) {
  const { c, config } = app.ctx;

  app.get<{ Params: { stallId: string } }>('/api/admin/stalls/:stallId', async (req) => {
    const stallId = parse(ObjectIdSchema, req.params.stallId);
    await requireStallAccess(req, stallId);
    const s = await c.stalls.findOne({ _id: new ObjectId(stallId) });
    if (!s) throw notFound();
    return {
      id: s._id.toHexString(),
      name: s.name,
      intro: s.intro,
      logo: s.logo,
      logoUrl: mediaUrl(s.logo),
      weeklyHours: s.weeklyHours,
      manualOverride: s.manualOverride && {
        state: s.manualOverride.state,
        until: s.manualOverride.until?.toISOString() ?? null,
      },
      sortOrder: s.sortOrder,
      visible: s.visible,
      isDemo: s.isDemo,
    } satisfies AdminStall;
  });

  app.get('/api/admin/foodcourt', async (req) => {
    await requireRole(req, 'super_admin');
    const f = await c.foodcourt.findOne({ _id: 'foodcourt' });
    if (!f) throw notFound();
    return {
      name: f.name,
      logo: f.logo,
      logoUrl: mediaUrl(f.logo),
      menuOpen: f.menuOpen,
      closedMessage: f.closedMessage,
      publicMenuUrl: config.PUBLIC_MENU_URL || null,
    } satisfies AdminFoodcourt;
  });
}
