import { KeycloakAdmin } from '@opencloud-eu/k6-tdk/lib/auth'
import { endpoints } from '@opencloud-eu/k6-tdk/lib/endpoints'
import { httpClientFactory, HttpClient } from '@opencloud-eu/k6-tdk/lib/utils'
import { CookieJar } from 'k6/http'

import { envValues } from '@/values'

export interface KeycloakAdminClient {
  createUser(p: { userLogin: string, userPassword: string }): string | undefined
  deleteUser(p: { userId: string }): void
  getUsers(p?: { username?: string }): Array<{ id: string, username: string }>
  assignRole(p: { userId: string }): void
}

export const keycloakAdminClientFor = (): KeycloakAdminClient => {
  const values = envValues()
  const jar = new CookieJar()

  const authNProvider = new KeycloakAdmin({
    adminLogin: values.keycloak_admin.user,
    adminPassword: values.keycloak_admin.password,
    baseUrl: values.keycloak_admin.base_url,
    jar
  })

  const httpClient: HttpClient = httpClientFactory({
    authNProvider,
    baseUrl: values.keycloak_admin.base_url,
    params: { jar, timeout: '360s' }
  })

  const realm = values.keycloak_admin.realm
  const roleName = values.keycloak_admin.role

  return {
    createUser({ userLogin, userPassword }): string | undefined {
      const response = endpoints.keycloak.admin.users.POST__create_user(httpClient, {
        realm,
        userLogin,
        userPassword
      })

      if (response.status !== 201) {
        console.error(`keycloakAdmin createUser failed: ${response.status} ${response.body}`)
        return undefined
      }

      const location = response.headers['Location'] || ''
      return location.split('/').pop()
    },

    deleteUser({ userId }): void {
      const response = endpoints.keycloak.admin.users.DELETE__delete_user(httpClient, { realm, userId })
      if (response.status !== 204) {
        console.error(`keycloakAdmin deleteUser failed: ${response.status}`)
      }
    },

    getUsers(p?: { username?: string }): Array<{ id: string, username: string }> {
      const response = endpoints.keycloak.admin.users.GET__get_users(httpClient, {
        realm,
        username: p?.username
      })

      if (response.status !== 200) {
        console.error(`keycloakAdmin getUsers failed: ${response.status}`)
        return []
      }

      return JSON.parse(response.body as string) as Array<{ id: string, username: string }>
    },

    assignRole({ userId }): void {
      const rolesResponse = endpoints.keycloak.admin.users.GET__get_realm_roles(httpClient, { realm })
      if (rolesResponse.status !== 200) {
        console.error(`keycloakAdmin getRoles failed: ${rolesResponse.status}`)
        return
      }

      const allRoles = JSON.parse(rolesResponse.body as string) as Array<{ id: string, name: string }>
      const targetRole = allRoles.find(r => r.name === roleName)
      if (!targetRole) {
        console.error(`keycloakAdmin role '${roleName}' not found`)
        return
      }

      const assignResponse = endpoints.keycloak.admin.users.POST__assign_realm_roles(httpClient, {
        realm,
        userId,
        roles: [{ id: targetRole.id, name: targetRole.name }]
      })

      if (assignResponse.status !== 204) {
        console.error(`keycloakAdmin assignRole failed: ${assignResponse.status}`)
      }
    }
  }
}
