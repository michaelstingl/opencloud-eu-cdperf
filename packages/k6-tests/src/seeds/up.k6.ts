import {queryJson} from '@opencloud-eu/k6-tdk/lib/utils'
import {randomBytes} from 'k6/crypto'
import {Options} from 'k6/options'

import {createCalendar, createCalendarResource} from '@/mock'
import {groupPool, userPool} from '@/pools'
import {clientFor, shareResource} from '@/shortcuts'
import {keycloakAdminClientFor} from '@/shortcuts/keycloakAdmin'
import {createTestRoot} from '@/test'
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

  /**
   * groups (always via OpenCloud Graph API)
   */
  const groupIdsOrNames: Array<string> = []
  const poolGroups = getPoolItems({pool: groupPool, n: values.seed.groups.total})
  if (values.seed.groups.create) {
    await Promise.all(
      poolGroups.map(async ({groupName}) => {
        const createGroupResponse = await adminClient.group.createGroup({groupName})
        const [groupIdOrName = groupName] = queryJson('id', createGroupResponse.body)
        groupIdsOrNames.push(groupIdOrName)
      })
    )
  }

  /**
   * users
   */
  const poolUsers = getPoolItems({pool: userPool, n: values.seed.users.total})
  const userIdsOrNames: Array<string> = []
  if (values.seed.users.create) {
    if (useKeycloak) {
      const kcAdmin = keycloakAdminClientFor()

      // Create users in Keycloak and assign roles
      const keycloakUserIds: Array<string> = []
      await Promise.all(
        poolUsers.map(async (user) => {
          const userId = kcAdmin.createUser(user)
          if (userId) {
            keycloakUserIds.push(userId)
            kcAdmin.assignRole({userId})
          }
        })
      )

      // Trigger OIDC login for each user to auto-provision them in OpenCloud,
      // then resolve their OpenCloud user ID via /graph/v1.0/me
      await Promise.all(
        poolUsers.map(async (user) => {
          const userClient = clientFor({userLogin: user.userLogin, userPassword: user.userPassword})
          const profileResponse = await userClient.me.getMyProfile()
          if (profileResponse) {
            const [ocUserId] = queryJson('$.id', profileResponse.body)
            if (ocUserId) {
              userIdsOrNames.push(ocUserId)
            }
          }
        })
      )
    } else {
      const getRolesResponse = await adminClient.role.getRoles()
      const [appRoleId] = queryJson("$.bundles[?(@.name === 'spaceadmin')].id", getRolesResponse?.body)

      const listApplicationsResponse = await adminClient.application.listApplications()
      const [resourceId] = queryJson("$.value[?(@.displayName === 'OpenCloud')].id", listApplicationsResponse?.body)

      await Promise.all(
        poolUsers.map(async (user) => {
          const createUserResponse = await adminClient.user.createUser(user)
          const [userIdOrName = user.userLogin] = queryJson('$.id', createUserResponse.body)
          userIdsOrNames.push(userIdOrName)

          await adminClient.user.enableUser({userId: user.userLogin})
          await adminClient.role.addRoleToUser({appRoleId, resourceId, principalId: userIdOrName})
        })
      )
    }
  }

  /**
   * users <-> groups (via OpenCloud Graph API)
   */
  await Promise.all(userIdsOrNames.map(async (userIdOrName) => {
    await Promise.all(groupIdsOrNames.map(async (groupIdOrName) => {
      await adminClient.group.addGroupUser({groupId: groupIdOrName, userId: userIdOrName})
    }))
  }))

  /**
   * resources
   */
  const testRoot = await createTestRoot({
    client: adminClient,
    resourceName: values.seed.container.name,
    resourceType: values.seed.container.type,
    userLogin: values.admin.login,
    platform: values.platform.type
  })

  await Promise.all(poolGroups.map(async (group) => {
    await shareResource({
      client: adminClient,
      root: testRoot.root,
      path: testRoot.path,
      shareReceiver: group.groupName,
      type: values.seed.container.type
    })
  }))

  /**
   * data
   */
  {
    await adminClient.resource.createResource({
      root: [testRoot.root, testRoot.path].join('/'),
      resourcePath: values.seed.resource.root
    })

    await Promise.all(
      [
        values.seed.resource.small,
        values.seed.resource.medium,
        values.seed.resource.large
      ].map(async (r) => {
        await adminClient.resource.uploadResource({
          root: [testRoot.root, testRoot.path, values.seed.resource.root].join('/'),
          resourcePath: r.name,
          resourceBytes: randomBytes(r.size)
        })
      })
    )
  }

  /**
   * calendar
   */
  {
    const calendar = createCalendar({
      root: values.seed.calendar.root,
      fromYear: values.seed.calendar.from_year,
      toYear: values.seed.calendar.to_year
    })

    await adminClient.resource.createResource({
      root: [testRoot.root, testRoot.path].join('/'),
      resourcePath: calendar.root
    })

    await Promise.all(calendar.y.map(async (y) => {
      await adminClient.resource.createResource({root: [testRoot.root, testRoot.path].join('/'), resourcePath: y})
    }))

    await Promise.all(calendar.m.map(async (m) => {
      await adminClient.resource.createResource({root: [testRoot.root, testRoot.path].join('/'), resourcePath: m})
    }))

    await Promise.all(calendar.d.map(async (d) => {
      await adminClient.resource.createResource({root: [testRoot.root, testRoot.path].join('/'), resourcePath: d})
    }))

    await Promise.all(
      calendar.d.map(async (v) => {
        const calendarResource = createCalendarResource({v})
        await adminClient.resource.uploadResource({
          root: [testRoot.root, testRoot.path].join('/'),
          resourcePath: calendarResource.resourcePath,
          resourceBytes: calendarResource.resourceContent
        })
      })
    )
  }
}

export default function vu(): void {
}
