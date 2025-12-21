"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useSocket } from "@/contexts/socket-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { ArrowLeft, Copy, Loader2, CheckCircle, XCircle } from "lucide-react"
import { api } from "@/lib/api"
import QRCode from "@/components/qr-code"
import Link from "next/link"
import { Progress } from "@/components/ui/progress"

export default function RequestMoney() {
  const [amount, setAmount] = useState("")
  const [qrData, setQrData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "pending" | "success" | "failed">("idle")
  const [initialBalance, setInitialBalance] = useState(0) // legacy balance heuristic (no longer used for success detection)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(120) // 2 minutes in seconds
  const [startTime, setStartTime] = useState<number | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { user, refreshUser, loading } = useAuth()
  const socket = useSocket()
  const router = useRouter()
  const { toast } = useToast()

  // Redirect if user is not logged in
  useEffect(() => {
    if (loading) return
    if (!user) {
      router.replace("/login")
    } else if (!user.hasPinSetup) {
      router.replace("/setup-pin")
    }
  }, [user, loading, router])

  // Socket.io listener for balance updates
  useEffect(() => {
    if (socket && user && isPolling) {
      socket.on("balance:updated", async (data) => {
        console.log("Balance updated event received:", data)
        await refreshUser()
        checkPaymentReceived()
      })

      socket.on("payment:completed", async (data) => {
        console.log("Payment completed event received:", data)
        await refreshUser()
        checkPaymentReceived()
      })

      return () => {
        socket.off("balance:updated")
        socket.off("payment:completed")
      }
    }
  }, [socket, user, isPolling, refreshUser])

  // Cleanup polling and timeout on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  // Timer countdown effect
  useEffect(() => {
    if (isPolling && timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining((prev) => prev - 1)
      }, 1000)

      return () => clearTimeout(timer)
    } else if (isPolling && timeRemaining === 0) {
      handlePaymentTimeout()
    }
  }, [isPolling, timeRemaining])

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Only allow numeric input with up to 2 decimal places
    if (/^\d*\.?\d{0,2}$/.test(value)) {
      setAmount(value)
    }
  }

  const STORAGE_KEY = "payband_request_money"

  const persistState = (data: any) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {}
  }

  const clearPersisted = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }

  const startPollingForPayment = (opts?: { restore?: boolean }) => {
    setIsPolling(true)
    if (!opts?.restore) {
      setInitialBalance(user?.balance || 0)
    }
    // Set up polling interval to check balance
    pollingIntervalRef.current = setInterval(checkPaymentReceived, 3000) // Check every 3 seconds
    // Set up timeout to fail after 2 minutes
    const remainingMs = startTime ? Math.max(0, 120000 - (Date.now() - startTime)) : 120000
    timeoutRef.current = setTimeout(handlePaymentTimeout, remainingMs)
  }

  const checkPaymentReceived = async () => {
    if (!user || !requestId || paymentStatus !== "pending") return
    try {
      const resp = await api.get(`/api/payments/request/status/${requestId}`)
      const status = resp.data.status
      if (status === "completed") {
        handlePaymentSuccess()
      } else if (status === "expired") {
        handlePaymentTimeout()
      }
    } catch (err: any) {
      // Treat missing request as timeout/expired
      if (err?.response?.status === 404) {
        handlePaymentTimeout()
      }
    }
  }

  const handlePaymentSuccess = () => {
    setPaymentStatus("success")
    setIsPolling(false)

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    toast({
      title: "Payment Received!",
      description: `₹${amount} has been added to your wallet.`,
      variant: "default",
    })
    clearPersisted()
  }

  const handlePaymentTimeout = () => {
    setPaymentStatus("failed")
    setIsPolling(false)

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    toast({
      title: "Payment Timed Out",
      description: "The payment request has expired. Please try again.",
      variant: "destructive",
    })
    clearPersisted()
  }

  const handleGenerateQR = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || Number.parseFloat(amount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid amount greater than 0.",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const response = await api.post("/api/payments/request", {
        amount: Number.parseFloat(amount),
      })

      setQrData(response.data)
      setRequestId(response.data.requestId)
      setPaymentStatus("pending")
      const now = Date.now()
      setStartTime(now)
      setTimeRemaining(120) // Reset timer to 2 minutes

      toast({
        title: "QR Code Generated",
        description: `Request for ₹${amount} created successfully.`,
      })

      // Persist initial request state
      persistState({
        amount: amount,
        qrData: response.data,
        requestId: response.data.requestId,
        paymentStatus: "pending",
        startTime: now,
        initialBalance: user?.balance || 0,
      })

      // Start polling for payment
      startPollingForPayment()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate payment request",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyLink = () => {
    if (qrData && qrData.paymentLink) {
      navigator.clipboard.writeText(qrData.paymentLink)
      toast({
        title: "Link Copied",
        description: "Payment link copied to clipboard",
      })
    }
  }

  const handleReset = () => {
    setQrData(null)
    setPaymentStatus("idle")
    setIsPolling(false)
    setStartTime(null)
    setRequestId(null)

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    clearPersisted()
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`
  }

  // Restore persisted request if present after auth resolves
  useEffect(() => {
    if (loading || !user) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!parsed || parsed.paymentStatus !== "pending") return
      const elapsed = Date.now() - parsed.startTime
      if (elapsed >= 120000) {
        // Expired
        clearPersisted()
        return
      }
      setAmount(parsed.amount.toString())
      setQrData(parsed.qrData)
      setPaymentStatus("pending")
      setStartTime(parsed.startTime)
      setInitialBalance(parsed.initialBalance)
      setRequestId(parsed.requestId || null)
      setTimeRemaining(Math.max(0, 120 - Math.floor(elapsed / 1000)))
      startPollingForPayment({ restore: true })
    } catch {}
  }, [loading, user])

  if (loading || !user) return null

  return (
    <div className="container max-w-md mx-auto py-10 px-4">
      <Link href="/dashboard" className="flex items-center text-sm mb-6 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to dashboard
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Request Money</CardTitle>
          <CardDescription>Generate a QR code for someone to scan and pay you</CardDescription>
        </CardHeader>
        {paymentStatus === "idle" && !qrData ? (
          <>
            <form onSubmit={handleGenerateQR}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₹)</Label>
                  <Input
                    id="amount"
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={handleAmountChange}
                    required
                  />
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating QR...
                    </>
                  ) : (
                    "Generate QR Code"
                  )}
                </Button>
              </CardFooter>
            </form>

            <CardContent className="border-t pt-4 mt-4">
              <div className="space-y-4">
                <p className="text-sm text-center font-medium">Your Merchant QR Code</p>
                <div className="mx-auto w-48 h-48 border rounded-lg p-2 bg-white">
                  <QRCode data={JSON.stringify({ merchantId: user.merchantId })} />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Share this QR code to receive direct payments</p>
                  <div className="flex items-center justify-center gap-2 bg-muted p-2 rounded-md">
                    <span className="font-mono text-xs">{user.merchantId}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(user.merchantId)
                        toast({
                          title: "Copied",
                          description: "Merchant ID copied to clipboard",
                        })
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </>
        ) : (
          <CardContent className="space-y-6 text-center">
            <div className="mx-auto w-64 h-64">
              <QRCode data={qrData.qrData} />
            </div>
            <div>
              <p className="font-medium">Request Amount</p>
              <p className="text-3xl font-bold">₹{amount}</p>
            </div>

            {paymentStatus === "pending" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Waiting for payment...</span>
                    <span>{formatTime(timeRemaining)}</span>
                  </div>
                  <Progress value={(timeRemaining / 120) * 100} className="h-2" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Ask the payer to scan this QR code with their PayBand watch
                </p>
              </div>
            )}

            {paymentStatus === "success" && (
              <div className="space-y-4">
                <div className="flex items-center justify-center text-green-600">
                  <CheckCircle className="h-12 w-12" />
                </div>
                <p className="font-medium text-green-600">Payment Received!</p>
                <p className="text-sm text-muted-foreground">₹{amount} has been added to your wallet.</p>
              </div>
            )}

            {paymentStatus === "failed" && (
              <div className="space-y-4">
                <div className="flex items-center justify-center text-red-600">
                  <XCircle className="h-12 w-12" />
                </div>
                <p className="font-medium text-red-600">Payment Timed Out</p>
                <p className="text-sm text-muted-foreground">The payment request has expired. Please try again.</p>
              </div>
            )}

            <div className="space-y-2">
              {qrData.paymentLink && paymentStatus === "pending" && (
                <Button variant="outline" className="w-full" onClick={handleCopyLink}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Payment Link
                </Button>
              )}
              <Button variant="outline" className="w-full" onClick={handleReset}>
                {paymentStatus === "pending" ? "Cancel Request" : "Create New Request"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
