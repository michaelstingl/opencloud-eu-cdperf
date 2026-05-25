import { Endpoint } from './endpoints'

export const POST__create_user: Endpoint<{
  realm: string,
  userLogin: string,
  userPassword: string
}, 'text'> = (httpClient, { realm, userLogin, userPassword }) => {
  // If userLogin already looks like an email (set up by the user pool
  // when KEYCLOAK_ADMIN_USE_EMAIL_AS_USERNAME=true), use it as-is for
  // both username and email so realms with registrationEmailAsUsername
  // accept the create. Otherwise keep the legacy behaviour where the
  // email is synthesised from the bare login name.
  const userLoginIsEmail = userLogin.includes('@')
  const email = userLoginIsEmail ? userLogin : `${userLogin}@cdperf.org`
  // firstName must pass Keycloak's person-name-prohibited-characters
  // validator, which rejects '@'. Strip the local part out of the email
  // form so realms with userProfile validation accept the create.
  const firstName = userLoginIsEmail ? userLogin.split('@')[0] : userLogin
  return httpClient('POST', `/admin/realms/${realm}/users`, JSON.stringify({
    username: userLogin,
    email,
    firstName,
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
