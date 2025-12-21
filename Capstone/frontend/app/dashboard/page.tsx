"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useSocket } from "@/contexts/socket-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/use-toast"
import { ArrowUpRight, ArrowDownLeft, Plus, QrCode, RefreshCw, Wallet } from "lucide-react"
import { api } from "@/lib/api"
import TransactionList from "@/components/transaction-list"
import BalanceCard from "@/components/balance-card"
import PINModal from "@/components/pin-modal"
import Link from "next/link"

// Keep this in sync with `components/transaction-list.tsx`
type Transaction = {
  _id: string
  type: "deposit" | "withdrawal" | "sent" | "received"
  amount: number
  description: string
  otherParty?: string
  createdAt: string
  [key: string]: any
}

export default function Dashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isPINModalOpen, setIsPINModalOpen] = useState(false)
  const [addAmount, setAddAmount] = useState("")
  const { user, refreshUser, loading } = useAuth()
  const socket = useSocket()
  const router = useRouter()
  const { toast } = useToast()

  // Redirect if user is not logged in
  useEffect(() => {
    // Wait for auth check to finish before deciding redirects
    if (loading) return
    if (!user) {
      router.replace("/login")
    } else if (!user.hasPinSetup) {
      router.replace("/setup-pin")
    }
  }, [user, loading, router])

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const response = await api.get("/api/transactions")
      // cast to our Transaction[] shape (API must match this shape)
      setTransactions(response.data.transactions as Transaction[])
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch transactions",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [user, toast])

  useEffect(() => {
    if (user) {
      fetchTransactions()
    }
  }, [user, fetchTransactions])

  // Listen for socket events
  useEffect(() => {
    if (!socket) return

    const handlePaymentCompleted = async (data: { amount: number; type: "received" | "sent"; otherParty: string }) => {
      toast({
        title: "Payment Completed",
        description: `₹${data.amount} ${data.type === "received" ? "received from" : "sent to"} ${data.otherParty}`,
      })
      await refreshUser()
      fetchTransactions()
    }

    const handleBalanceUpdated = async (data: { balance: number }) => {
      console.log("Balance updated:", data)
      await refreshUser()
    }

    const handlePaymentFailed = (data?: { message?: string }) => {
      toast({
        title: "Payment Failed",
        description: data?.message,
        variant: "destructive",
      })
    }

    socket.on("payment:completed", handlePaymentCompleted)
    socket.on("payment:failed", handlePaymentFailed)
    socket.on("balance:updated", handleBalanceUpdated)

    return () => {
      socket.off("payment:completed", handlePaymentCompleted)
      socket.off("payment:failed", handlePaymentFailed)
      socket.off("balance:updated", handleBalanceUpdated)
    }
  }, [socket, toast, refreshUser, fetchTransactions])

  const handleAddFunds = (amount: string): void => {
    setAddAmount(amount)
    setIsPINModalOpen(true)
  }

  const handlePINVerified = async (): Promise<void> => {
    try {
      await api.post("/api/wallet/add-funds", { amount: Number.parseFloat(addAmount) })
      await refreshUser()

      toast({
        title: "Success",
        description: `₹${addAmount} added to your wallet`,
      })
      setAddAmount("")
      setIsPINModalOpen(false)
      fetchTransactions()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add funds",
        variant: "destructive",
      })
    }
  }

  // Avoid flashing redirect state while auth is loading
  if (loading || !user) return null

  return (
    <div className="container mx-auto py-6 px-4 max-w-6xl">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column - Balance and Quick Actions */}
        <div className="md:w-1/3 space-y-6">
          <BalanceCard balance={user.balance} />

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                className="h-24 flex flex-col items-center justify-center space-y-2"
                onClick={() => handleAddFunds("100")}
              >
                <Plus className="h-6 w-6" />
                <span>Add ₹100</span>
              </Button>
              <Button
                variant="outline"
                className="h-24 flex flex-col items-center justify-center space-y-2"
                onClick={() => handleAddFunds("500")}
              >
                <Plus className="h-6 w-6" />
                <span>Add ₹500</span>
              </Button>
              <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-2" asChild>
                <Link href="/request-money">
                  <QrCode className="h-6 w-6" />
                  <span>Request</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-24 flex flex-col items-center justify-center space-y-2" asChild>
                <Link href="/profile">
                  <Wallet className="h-6 w-6" />
                  <span>Profile</span>
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Transactions */}
        <div className="md:w-2/3">
          <Card className="h-full">
            <CardHeader className="flex flex-row items-center">
              <div>
                <CardTitle>Transactions</CardTitle>
                <CardDescription>Your recent transaction history</CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="ml-auto" onClick={fetchTransactions} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all">
                <TabsList className="mb-4">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="incoming">
                    <ArrowDownLeft className="h-4 w-4 mr-2" />
                    Incoming
                  </TabsTrigger>
                  <TabsTrigger value="outgoing">
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    Outgoing
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="all">
                  <TransactionList transactions={transactions} isLoading={isLoading} />
                </TabsContent>
                <TabsContent value="incoming">
                  <TransactionList
                    transactions={transactions.filter((t: Transaction) => t.type === "deposit" || t.type === "received")}
                    isLoading={isLoading}
                  />
                </TabsContent>
                <TabsContent value="outgoing">
                  <TransactionList
                    transactions={transactions.filter((t: Transaction) => t.type === "withdrawal" || t.type === "sent")}
                    isLoading={isLoading}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>

      <PINModal isOpen={isPINModalOpen} onClose={() => setIsPINModalOpen(false)} onVerify={handlePINVerified} />
    </div>
  )
}
 
