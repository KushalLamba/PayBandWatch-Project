import axios from "axios"

// Create axios instance with base URL
export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000, // 10 seconds timeout
})
// Optionally expose baseURL in development via a single debug flag
const DEBUG_API = false
if (DEBUG_API) {
  // eslint-disable-next-line no-console
  console.log("📡 API baseURL is:", api.defaults.baseURL)
}
// Add request interceptor to add token to requests
api.interceptors.request.use(
  (config) => {
    if (DEBUG_API) {
      // eslint-disable-next-line no-console
      console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`)
    }
    const token = localStorage.getItem("token")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    console.error("API Request Error:", error)
    return Promise.reject(error)
  },
)

// Add response interceptor to handle token expiration and log errors
api.interceptors.response.use(
  (response) => {
    if (DEBUG_API) {
      // eslint-disable-next-line no-console
      console.log(`API Response: ${response.status} ${response.config.url}`)
    }
    return response
  },
  (error) => {
    if (error.response) {
      const requestUrl = error.response.config.url || ""
      const status = error.response.status
      const isLogin = /\/api\/auth\/login$/.test(requestUrl)
      const isRegister = /\/api\/auth\/register$/.test(requestUrl)

      // Suppress noisy credential error logs for expected invalid attempts
      if (!(status === 401 && (isLogin || isRegister))) {
        console.error(`API Error ${status}: ${requestUrl}`, error.response.data)
      }

      if (status === 404) {
        console.error("404 Not Found: The requested endpoint does not exist")
      }

      if (status === 401) {
        const hadToken = !!localStorage.getItem("token")
        // Normalize credential errors so callers can catch a consistent sentinel error.
        if (isLogin) {
          return Promise.reject(new Error("INVALID_CREDENTIALS"))
        }
        if (isRegister) {
          return Promise.reject(new Error("INVALID_REGISTRATION"))
        }
        // Session expiry: token existed and 401 from protected route.
        if (hadToken) {
          localStorage.removeItem("token")
          window.location.assign("/login")
        }
      }
    } else if (error.request) {
      console.error("API Error: No response received", error.request)
    } else {
      console.error("API Error:", error.message)
    }
    return Promise.reject(error)
  },
)

// Helper fun ction to check API health
export const checkApiHealth = async () => {
  try {
    const response = await api.get("/api/health")
    return response.data.status === "ok"
  } catch (error) {
    console.error("API Health Check Failed:", error)
    return false
  }
}
