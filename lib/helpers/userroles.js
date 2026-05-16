// All role name changes must be made ONLY in the ROLE map below.
// Everything else (groups, checks) derives from it automatically.

// 1. Master Role Name Map  <- THE ONLY PLACE YOU EVER CHANGE ROLE STRINGS
const ROLE = {
	// Admin
	ADMIN: 'Admin',

	// FMS Sales
	HO_SALES: 'HO Sales',
	ZM: 'ZM',
	KAM: 'KAM',

	// Fleet Engineers
	AMCS_FTE: 'AMCS FTE',
	AMCC_FTE: 'AMCC FTE',
	XE_FTE: 'XE FTE',
	DE_FTE: 'DE FTE',

	// Customers
	FM: 'FM',  // Fleet Manager
	FO: 'FO',  // Fleet Owner
};

// 2. Role Groups  (built from ROLE — never use raw strings here)

/** Admin */
const ADMIN_ROLES = [ROLE.ADMIN];

/** FMS sales team */
const FMS_SALES_ROLES = [ROLE.HO_SALES, ROLE.ZM, ROLE.KAM];


/** All sales personas (FMS) */
const SALES_ROLES = [...FMS_SALES_ROLES];

/** Head-of-Sales level (FMS) */
const HO_ROLES = [ROLE.HO_SALES];

/** Zonal Manager level (FMS) */
const ZM_ROLES = [ROLE.ZM];

/** Key Account Manager level (FMS) */
const KAM_ROLES = [ROLE.KAM];

/** Fleet Engineers */
const FTE_ROLES = [ROLE.AMCS_FTE, ROLE.AMCC_FTE, ROLE.XE_FTE, ROLE.DE_FTE, ROLE.ARSA];

/** AMC Fleet Engineers */
const AMC_FTE_ROLES = [ROLE.AMCS_FTE, ROLE.AMCC_FTE];

/** Xpert-Edge Engineers */
const XEFTE_ROLES = [ROLE.XE_FTE, ROLE.ARSA];

/** Customer roles */
const FLEET_ROLES = [ROLE.FM, ROLE.FO];

/** Every known role */
const ALL_ROLES = [...ADMIN_ROLES, ...SALES_ROLES, ...FTE_ROLES, ...FLEET_ROLES];


// 3. Core Validator
/**
 * Check whether `role` belongs to AT LEAST ONE of the supplied groups/roles.
 *
 * @param {string} role   - the role string (e.g. res.locals.role)
 * @param {...(string|string[])} groups - one or more role arrays OR individual role strings
 *
 * @example
 * hasRole(role, SALES_ROLES)
 * hasRole(role, HO_ROLES, ADMIN_ROLES)
 * hasRole(role, ROLE.ADMIN)
 * hasRole(role, ADMIN_ROLES, ROLE.HO_SALES)
 */
function hasRole(role, ...groups) {
	if (!role) return false;
	const allowed = groups.flat();
	return allowed.includes(role);
}

/**
 * Assert that `role` is a valid known role.
 * Useful for early-exit guards at route entry points.
 *
 * @param {string} role
 * @returns {boolean}
 */
function isValidRole(role) {
	return !!role && ALL_ROLES.includes(role);
}

// 4. Convenience Shorthand Checkers
const isAdmin = (r) => hasRole(r, ADMIN_ROLES);
const isSales = (r) => hasRole(r, SALES_ROLES);
const isFmsSales = (r) => hasRole(r, FMS_SALES_ROLES);
const isAmcFtes = (r) => hasRole(r, AMC_FTE_ROLES);
const isHO = (r) => hasRole(r, HO_ROLES);
const isZM = (r) => hasRole(r, ZM_ROLES);
const isKAM = (r) => hasRole(r, KAM_ROLES);
const isFTE = (r) => hasRole(r, FTE_ROLES);
const isXeFTE = (r) => hasRole(r, XEFTE_ROLES);
const isAMCSFTE = (r) => hasRole(r, ROLE.AMCS_FTE);
const isAMCCFTE = (r) => hasRole(r, ROLE.AMCC_FTE);
const isFleet = (r) => hasRole(r, FLEET_ROLES);

// 5. Exports
module.exports = {
	// Master map
	ROLE,

	// Groups
	ADMIN_ROLES,
	FMS_SALES_ROLES,
	SALES_ROLES,
	HO_ROLES,
	ZM_ROLES,
	KAM_ROLES,
	FTE_ROLES,
	XEFTE_ROLES,
	FLEET_ROLES,
	ALL_ROLES,

	// Core validators
	hasRole,
	isValidRole,

	// Shorthand checkers
	isAdmin,
	isSales,
	isFmsSales,
	isHO,
	isZM,
	isKAM,
	isFTE,
	isXeFTE,
	isFleet,
	isAmcFtes,
	isAMCSFTE,
	isAMCCFTE
};

/* Example function usage

// Single role check
if (hasRole(role, ROLE.ADMIN)) { ... }

// Against a group
if (hasRole(role, SALES_ROLES)) { ... }

// Multiple groups in one call
if (hasRole(role, HO_ROLES, ADMIN_ROLES)) { ... }

// Mix group + individual
if (hasRole(role, SALES_ROLES, ROLE.ADMIN)) { ... }

// Shorthand
if (isAdmin(role)) { ... }
if (isSales(role)) { ... }

// Direct function for single role check
if (!isAmcFte(res.locals.role)) { ... }

*/