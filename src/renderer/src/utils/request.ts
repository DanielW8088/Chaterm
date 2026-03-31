import axios, { type AxiosInstance } from 'axios'
import config from '@/config'

function attachInterceptors(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.response.use(
    (res) => {
      return res.data
    },
    function (error) {
      return Promise.reject(error)
    }
  )

  return instance
}

export function createAuthedRequest(baseURL: string): AxiosInstance {
  const instance = axios.create({ baseURL })
  return attachInterceptors(instance)
}

const request = createAuthedRequest(config.api)

export default request
