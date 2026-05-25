import { SharedArray } from 'k6/data'

import { envValues } from '@/values'

import { getPool } from './pools'
import defaultUserPool from './user.pool.json'

export type PoolUser = {
  userLogin: string;
  userPassword: string;
}

// When KEYCLOAK_ADMIN_USE_EMAIL_AS_USERNAME=true (i.e. the target realm
// enforces registrationEmailAsUsername), promote bare userLogin names to
// email-shaped logins so they round-trip through Keycloak. Both
// keycloak-admin-users.ts and the post-create OIDC sign-in then use the
// same identifier.
const transformForEmailUsername = (users: PoolUser[]): PoolUser[] => {
  if (!envValues().keycloak_admin.use_email_as_username) {
    return users
  }
  return users.map((u) => ({
    ...u,
    userLogin: u.userLogin.includes('@') ? u.userLogin : `${u.userLogin}@cdperf.org`
  }))
}

export const userPool: PoolUser[] = new SharedArray('user pool', (() => {
  return transformForEmailUsername(getPool(envValues().pool.users, defaultUserPool))
}))
