import createClient from 'openapi-react-query'
import { apiClient } from './client'

const $api = createClient(apiClient)

export { $api }
