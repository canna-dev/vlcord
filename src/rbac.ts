/**
 * Role-Based Access Control (RBAC) System
 */

import type { Request, Response, NextFunction } from 'express';
import { getLogger } from './logger.js';

const logger = getLogger();

/**
 * Role definitions and permissions
 */
export enum Role {
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  USER = 'user',
  VIEWER = 'viewer'
}

export interface Permission {
  resource: string;
  action: string; // 'read', 'create', 'update', 'delete'
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.ADMIN]: [
    // Full access
    { resource: '*', action: '*' }
  ],
  [Role.MODERATOR]: [
    // Monitor and override management
    { resource: 'monitor', action: 'read' },
    { resource: 'monitor', action: 'update' },
    { resource: 'metadata', action: 'read' },
    { resource: 'metadata', action: 'create' },
    { resource: 'metadata', action: 'update' },
    { resource: 'metadata', action: 'delete' },
    { resource: 'activity', action: 'read' },
    { resource: 'system', action: 'read' }
  ],
  [Role.USER]: [
    // Basic read and activity management
    { resource: 'monitor', action: 'read' },
    { resource: 'activity', action: 'read' },
    { resource: 'status', action: 'read' },
    { resource: 'health', action: 'read' }
  ],
  [Role.VIEWER]: [
    // Read-only access
    { resource: 'status', action: 'read' },
    { resource: 'health', action: 'read' }
  ]
};

/**
 * User identity with roles
 */
export interface User {
  id: string;
  username: string;
  roles: Role[];
  token: string;
  createdAt: number;
  lastLogin?: number;
}

/**
 * RBAC Manager
 */
export class RBACManager {
  private users: Map<string, User> = new Map();
  private tokens: Map<string, User> = new Map();

  /**
   * Create a new user
   */
  createUser(id: string, username: string, roles: Role[], token: string): User {
    const user: User = {
      id,
      username,
      roles,
      token,
      createdAt: Date.now()
    };

    this.users.set(id, user);
    this.tokens.set(token, user);

    logger.info('RBAC', 'User created', { userId: id, username, roles });
    return user;
  }

  /**
   * Get user by ID
   */
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  /**
   * Get user by token
   */
  getUserByToken(token: string): User | undefined {
    return this.tokens.get(token);
  }

  /**
   * Update user roles
   */
  updateUserRoles(userId: string, roles: Role[]): boolean {
    const user = this.users.get(userId);
    if (!user) return false;

    user.roles = roles;
    logger.info('RBAC', 'User roles updated', { userId, roles });
    return true;
  }

  /**
   * Delete user
   */
  deleteUser(id: string): boolean {
    const user = this.users.get(id);
    if (!user) return false;

    this.users.delete(id);
    this.tokens.delete(user.token);

    logger.info('RBAC', 'User deleted', { userId: id });
    return true;
  }

  /**
   * Check if user has permission
   */
  hasPermission(user: User, resource: string, action: string): boolean {
    // Check all user roles
    for (const role of user.roles) {
      const permissions = ROLE_PERMISSIONS[role];
      const hasMatch = permissions.some(
        perm =>
          (perm.resource === '*' || perm.resource === resource) &&
          (perm.action === '*' || perm.action === action)
      );

      if (hasMatch) return true;
    }

    return false;
  }

  /**
   * Get all permissions for user
   */
  getUserPermissions(user: User): Permission[] {
    const permissions: Permission[] = [];
    const seen = new Set<string>();

    for (const role of user.roles) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        const key = `${permission.resource}:${permission.action}`;
        if (!seen.has(key)) {
          permissions.push(permission);
          seen.add(key);
        }
      }
    }

    return permissions;
  }

  /**
   * List all users
   */
  listUsers(): User[] {
    return Array.from(this.users.values());
  }
}

/**
 * Global RBAC manager instance
 */
let rbacManagerInstance: RBACManager | null = null;

export function initializeRBAC(): RBACManager {
  rbacManagerInstance = new RBACManager();
  return rbacManagerInstance;
}

export function getRBAC(): RBACManager {
  if (!rbacManagerInstance) {
    rbacManagerInstance = initializeRBAC();
  }
  return rbacManagerInstance;
}

/**
 * Express middleware for authentication
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Missing authentication token',
      timestamp: Date.now()
    });
  }

  const rbac = getRBAC();
  const user = rbac.getUserByToken(token);

  if (!user) {
    logger.warn('RBAC', 'Invalid token provided');
    return res.status(401).json({
      success: false,
      error: 'Invalid authentication token',
      timestamp: Date.now()
    });
  }

  // Update last login
  user.lastLogin = Date.now();

  // Attach user to request
  (req as any).user = user;
  next();
}

/**
 * Express middleware for authorization
 */
export function authorizationMiddleware(resource: string, action: string = 'read') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Not authenticated',
        timestamp: Date.now()
      });
    }

    const rbac = getRBAC();
    if (!rbac.hasPermission(user, resource, action)) {
      logger.warn('RBAC', 'Authorization denied', {
        userId: user.id,
        resource,
        action
      });

      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        timestamp: Date.now()
      });
    }

    next();
  };
}

/**
 * Helper to check permission in request handlers
 */
export function checkPermission(user: User, resource: string, action: string): boolean {
  const rbac = getRBAC();
  return rbac.hasPermission(user, resource, action);
}

/**
 * API endpoint factory with RBAC
 */
export function createProtectedEndpoint(
  resource: string,
  action: string = 'read'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        timestamp: Date.now()
      });
    }

    const rbac = getRBAC();
    if (!rbac.hasPermission(user, resource, action)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions for this action',
        timestamp: Date.now()
      });
    }

    next();
  };
}

export default {
  Role,
  ROLE_PERMISSIONS,
  RBACManager,
  initializeRBAC,
  getRBAC,
  authMiddleware,
  authorizationMiddleware,
  checkPermission,
  createProtectedEndpoint
};
