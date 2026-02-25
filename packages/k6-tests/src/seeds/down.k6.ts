import {Options} from 'k6/options'

import {queryJson} from '@opencloud-eu/k6-tdk/lib/utils'
import {groupPool, userPool} from '@/pools'
import {clientFor} from '@/shortcuts'
import {keycloakAdminClientFor} from '@/shortcuts/keycloakAdmin'
import {deleteTestRoot} from '@/test'
import {getPoolItems} from '@/utils'
import {envValues} from '@/values'
import {UserProvider} from '@/values/const'

export const options: Options = {
  vus: 1,
  insecureSkipTLSVerify: true,
  setupTimeout: '1h'
}

export async function setup(): Promise<void> {
  const values = envValues()
  const adminClient = clientFor({userLogin: values.admin.login, userPassword: values.admin.password})
  const useKeycloak = values.seed_user_provider.type === UserProvider.keycloak

  if (values.seed.groups.delete) {
    const apiGroups = await adminClient.group.getGroups()
    const groups = getPoolItems({pool: groupPool, n: values.seed.groups.total}).map((poolGroup) => {
      const [idOrName = poolGroup.groupName] = queryJson(`$.value[?(@.displayName === '${poolGroup.groupName}')].id`, apiGroups?.body)
      return Object.assign({}, {id: idOrName}, poolGroup)
    })

    await Promise.all(
      groups.map(async ({id}) => {
        await adminClient.group.deleteGroup({groupId: id})
      })
    )
  }

  if (values.seed.users.delete) {
    if (useKeycloak) {
      const kcAdmin = keycloakAdminClientFor()
      const poolUsers = getPoolItems({pool: userPool, n: values.seed.users.total})

      await Promise.all(
        poolUsers.map(async (poolUser) => {
          const users = kcAdmin.getUsers({username: poolUser.userLogin})
          if (users.length > 0) {
            kcAdmin.deleteUser({userId: users[0].id})
          }
        })
      )
    } else {
      const apiUsers = await adminClient.user.getUsers()
      const users = getPoolItems({pool: userPool, n: values.seed.users.total}).map((poolUser) => {
        const [idOrLogin = poolUser.userLogin] = queryJson(`$.value[?(@.displayName === '${poolUser.userLogin}')].id`, apiUsers?.body)
        return Object.assign({}, {id: idOrLogin}, poolUser)
      })

      await Promise.all(
        users.map(async (user) => {
          await adminClient.user.deleteUser({userId: user.id})
        })
      )
    }
  }

  await deleteTestRoot({
    client: adminClient,
    resourceName: values.seed.container.name,
    resourceType: values.seed.container.type,
    userLogin: values.admin.login,
    platform: values.platform.type
  })
}

export default function noop(): void {
}
