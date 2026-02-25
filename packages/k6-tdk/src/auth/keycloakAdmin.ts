import http, { CookieJar } from 'k6/http'

import { check, cleanURL } from '@/utils'

import { AuthNHTTPProvider, Token } from './auth'

export class KeycloakAdmin implements AuthNHTTPProvider {
  private readonly jar: CookieJar

  private readonly adminLogin: string

  private readonly adminPassword: string

  private readonly baseUrl: string

  private cache?: {
    validTo: Date
    token: Token
  }

  constructor(p: {
    adminLogin: string,
    adminPassword: string,
    baseUrl: string,
    jar: CookieJar
  }) {
    this.adminLogin = p.adminLogin
    this.adminPassword = p.adminPassword
    this.baseUrl = p.baseUrl
    this.jar = p.jar
  }

  get headers() {
    const upsertCache = (t: Token) => {
      this.cache = {
        validTo: ((): Date => {
          const d = new Date()

          d.setSeconds(d.getSeconds() + t.expiresIn - Math.min(60, t.expiresIn * .1))

          return d
        })(),
        token: t
      }
    }

    const loginRequired = !this.cache
    if (loginRequired) {
      const token = this.login()
      upsertCache(token)
    }

    const refreshRequired = this.cache && this.cache.validTo <= new Date()
    if (refreshRequired) {
      const token = this.refreshTokens()
      upsertCache(token)
    }

    return { Authorization: `${this.cache!.token.tokenType} ${this.cache!.token.accessToken}` }
  }

  private get tokenEndpoint() {
    return cleanURL(`${this.baseUrl}/realms/master/protocol/openid-connect/token`)
  }

  public login(): Token {
    const accessTokenResponse = http.post(this.tokenEndpoint, {
      client_id: 'admin-cli',
      username: this.adminLogin,
      password: this.adminPassword,
      grant_type: 'password'
    }, { jar: this.jar })

    check({ val: accessTokenResponse }, {
      'authn -> keycloakAdmin accessTokenResponse - status': ({ status }) => {
        return status === 200
      }
    })

    if (accessTokenResponse.status !== 200) {
      throw new Error(`keycloakAdmin accessTokenResponse.status is ${accessTokenResponse.status}, expected 200`)
    }

    return {
      refreshToken: accessTokenResponse.json('refresh_token') as string,
      accessToken: accessTokenResponse.json('access_token') as string,
      tokenType: accessTokenResponse.json('token_type') as string,
      idToken: '',
      expiresIn: accessTokenResponse.json('expires_in') as number
    }
  }

  refreshTokens(): Token {
    const accessTokenResponse = http.post(this.tokenEndpoint, {
      grant_type: 'refresh_token',
      refresh_token: this.cache!.token.refreshToken,
      client_id: 'admin-cli'
    }, { jar: this.jar })

    check({ val: accessTokenResponse }, {
      'authn -> keycloakAdmin refreshTokenResponse - status': ({ status }) => {
        return status === 200
      }
    })

    if (accessTokenResponse.status !== 200) {
      throw new Error(`keycloakAdmin refreshTokenResponse.status is ${accessTokenResponse.status}, expected 200`)
    }

    return {
      refreshToken: accessTokenResponse.json('refresh_token') as string,
      accessToken: accessTokenResponse.json('access_token') as string,
      tokenType: accessTokenResponse.json('token_type') as string,
      idToken: '',
      expiresIn: accessTokenResponse.json('expires_in') as number
    }
  }
}
