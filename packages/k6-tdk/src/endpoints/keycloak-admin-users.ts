import { Endpoint } from './endpoints'

export const POST__create_user: Endpoint<{
  realm: string,
  userLogin: string,
  userPassword: string
}, 'text'> = (httpClient, { realm, userLogin, userPassword }) => {
  return httpClient('POST', `/admin/realms/${realm}/users`, JSON.stringify({
    username: userLogin,
    email: `${userLogin}@cdperf.org`,
    firstName: userLogin,
    lastName: 'cdperf',
    emailVerified: true,
    enabled: true,
    credentials: [{
      type: 'password',
      value: userPassword,
      temporary: false
    }]
  }))
}

export const DELETE__delete_user: Endpoint<{ realm: string, userId: string }, 'none'> = (httpClient, {
  realm,
  userId
}) => {
  return httpClient('DELETE', `/admin/realms/${realm}/users/${userId}`)
}

export const GET__get_users: Endpoint<{ realm: string, username?: string }, 'text'> = (httpClient, {
  realm,
  username
}) => {
  const query = username ? `?username=${encodeURIComponent(username)}&exact=true` : ''
  return httpClient('GET', `/admin/realms/${realm}/users${query}`)
}

export const GET__get_realm_roles: Endpoint<{ realm: string }, 'text'> = (httpClient, { realm }) => {
  return httpClient('GET', `/admin/realms/${realm}/roles`)
}

export const POST__assign_realm_roles: Endpoint<{
  realm: string,
  userId: string,
  roles: Array<{ id: string, name: string }>
}, 'none'> = (httpClient, { realm, userId, roles }) => {
  return httpClient('POST', `/admin/realms/${realm}/users/${userId}/role-mappings/realm`, JSON.stringify(roles))
}
