
const cds = require('@sap/cds');

const users = {
  admin: {
    id: 'admin',
   roles: [
        'Administrator',
        'SalesCoordinator',
        'WarehouseUser',
        'JobScheduler',
        'jobscheduler'
    ],
    attr: {}
  },
  dealer1: {
    id: 'dealer1',
    roles: ['DealerUser'],
    attr: { dealerNo: 'D1001' }
  },
  dealer2: {
    id: 'dealer2',
    roles: ['DealerUser'],
    attr: { dealerNo: 'D1002' }
  },
  coordinator: {
    id: 'coordinator',
    roles: ['SalesCoordinator'],
    attr: {}
  },
  warehouse: {
    id: 'warehouse',
    roles: ['WarehouseUser'],
    attr: {}
  }
};

module.exports = function localRoleAuth(req, res, next) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const requestedRole = url.searchParams.get('role');
    const pathname = url.pathname;

    // Read existing cookie
    const cookieHeader = req.headers.cookie || '';
    const cookies = {};

    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');

      if (parts.length >= 2) {
        cookies[parts[0]] = decodeURIComponent(
          parts.slice(1).join('=')
        );
      }
    });

    const selectedRole = requestedRole
    || req.headers['x-local-role']
    || cookies.sodv_local_role;

    console.log('[LOCAL AUTH] Requested role:', requestedRole);
    console.log('[LOCAL AUTH] Cookie role:', cookies.sodv_local_role);
    console.log('[LOCAL AUTH] Selected role:', selectedRole);

    // No role selected
    if (!selectedRole) {
      cds.context.user = cds.User.anonymous;

      if (pathname === '/') {
        return res.status(200).json({
          message: 'Please select a role using the URL.',
          availableRoles: [
            'admin',
            'dealer1',
            'dealer2',
            'coordinator',
            'warehouse'
          ]
        });
      }

      return next();
    }

    // Validate role
    const user = users[selectedRole];

    if (!user) {
      return res.status(400).json({
        error: 'Invalid role',
        availableRoles: Object.keys(users)
      });
    }

    // Save selected role in browser cookie
    if (requestedRole) {
      res.setHeader(
        'Set-Cookie',
        `sodv_local_role=${encodeURIComponent(selectedRole)}; Path=/; Max-Age=28800; SameSite=Lax`
      );
    }

    // Set CAP user
    cds.context.user = new cds.User({
      id: user.id,
      roles: user.roles,
      attr: user.attr
    });

    console.log('[LOCAL AUTH] Active user:', user.id);
    console.log('[LOCAL AUTH] Active roles:', user.roles);
    console.log('[LOCAL AUTH] Dealer:', user.attr.dealerNo || 'N/A');

    // Handle the root URL
    if (pathname === '/') {
      return res.status(200).json({
        message: 'Role selected successfully',
        activeUser: user.id,
        activeRoles: user.roles,
        dealerNo: user.attr.dealerNo || null,
        availableDataEndpoint: user.roles.includes('DealerUser')
          ? '/odata/v4/dealer/SalesOrders'
          : '/odata/v4/internal/DealerAccounts'
      });
    }

    // Continue normal CAP/OData processing
    next();

  } catch (error) {
    console.error('[LOCAL AUTH ERROR]', error);
    next(error);
  }
};
