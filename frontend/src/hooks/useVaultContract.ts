import { useState, useCallback } from 'react';
import {
    xdr,
    Address,
    Operation,
    TransactionBuilder,
    SorobanRpc,
    nativeToScVal,
    scValToNative
} from 'stellar-sdk';
import { signTransaction } from '@stellar/freighter-api';
import { useWallet } from '../context/WalletContextProps';
import { parseError } from '../utils/errorParser';
import type { VaultActivity, GetVaultEventsResult, VaultEventType } from '../types/activity';

const CONTRACT_ID = "CDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const RPC_URL = "https://soroban-testnet.stellar.org";
const EVENTS_PAGE_SIZE = 20;

// Recurring Payment Types
export interface RecurringPayment {
    id: string;
    recipient: string;
    token: string;
    amount: string;
    memo: string;
    interval: number; // in seconds
    nextPaymentTime: number; // timestamp
    totalPayments: number;
    status: 'active' | 'paused' | 'cancelled';
    createdAt: number;
    creator: string;
}

export interface RecurringPaymentHistory {
    id: string;
    paymentId: string;
    executedAt: number;
    transactionHash: string;
    amount: string;
    success: boolean;
}

export interface CreateRecurringPaymentParams {
    recipient: string;
    token: string;
    amount: string;
    memo: string;
    interval: number; // in seconds
}

const server = new SorobanRpc.Server(RPC_URL);

interface StellarBalance {
    asset_type: string;
    balance: string;
}

/** Known contract event names (topic[0] symbol) */
const EVENT_SYMBOLS: VaultEventType[] = [
    'proposal_created', 'proposal_approved', 'proposal_ready', 'proposal_executed',
    'proposal_rejected', 'signer_added', 'signer_removed', 'config_updated', 'initialized', 'role_assigned'
];

function getEventTypeFromTopic(topic0Base64: string): VaultEventType {
    try {
        const scv = xdr.ScVal.fromXDR(topic0Base64, 'base64');
        const native = scValToNative(scv);
        if (typeof native === 'string' && EVENT_SYMBOLS.includes(native as VaultEventType)) {
            return native as VaultEventType;
        }
        return 'unknown';
    } catch {
        return 'unknown';
    }
}

function addressToNative(addrScVal: unknown): string {
    if (typeof addrScVal === 'string') return addrScVal;
    if (addrScVal != null && typeof addrScVal === 'object') {
        const o = addrScVal as Record<string, unknown>;
        if (typeof o.address === 'function') return (o.address as () => string)();
        if (typeof o.address === 'string') return o.address;
    }
    return String(addrScVal ?? '');
}

function parseEventValue(valueXdrBase64: string, eventType: VaultEventType): { actor: string; details: Record<string, unknown> } {
    const details: Record<string, unknown> = {};
    let actor = '';
    try {
        const scv = xdr.ScVal.fromXDR(valueXdrBase64, 'base64');
        const native = scValToNative(scv);
        if (Array.isArray(native)) {
            const vec = native as unknown[];
            const first = vec[0];
            actor = addressToNative(first);
            if (eventType === 'proposal_created' && vec.length >= 3) {
                details.proposer = actor;
                details.recipient = addressToNative(vec[1]);
                details.amount = vec[2] != null ? String(vec[2]) : '';
            } else if (eventType === 'proposal_approved' && vec.length >= 3) {
                details.approval_count = vec[1];
                details.threshold = vec[2];
            } else if (eventType === 'proposal_executed' && vec.length >= 3) {
                details.recipient = addressToNative(vec[1]);
                details.amount = vec[2] != null ? String(vec[2]) : '';
            } else if ((eventType === 'signer_added' || eventType === 'signer_removed') && vec.length >= 2) {
                details.total_signers = vec[1];
            } else if (eventType === 'role_assigned' && vec.length >= 2) {
                details.role = vec[1];
            } else {
                details.raw = native;
            }
        } else {
            actor = addressToNative(native);
            if (native !== null && typeof native === 'object') {
                details.raw = native;
            }
        }
    } catch {
        details.parseError = true;
    }
    return { actor, details };
}

interface RawEvent {
    type: string;
    ledger: string;
    ledgerClosedAt?: string;
    contractId?: string;
    id: string;
    pagingToken?: string;
    inSuccessfulContractCall?: boolean;
    topic?: string[];
    value?: { xdr: string };
}

export const useVaultContract = () => {
    const { address, isConnected } = useWallet();
    const [loading, setLoading] = useState(false);

    const getDashboardStats = useCallback(async () => {
        try {
            const accountInfo = await server.getAccount(CONTRACT_ID) as unknown as { balances: StellarBalance[] };
            const nativeBalance = accountInfo.balances.find((b: StellarBalance) => b.asset_type === 'native');
            const balance = nativeBalance ? parseFloat(nativeBalance.balance).toLocaleString() : "0";

            return {
                totalBalance: balance,
                totalProposals: 24,
                pendingApprovals: 3,
                readyToExecute: 1,
                activeSigners: 5,
                threshold: "3/5"
            };
        } catch (e) {
            console.error("Failed to fetch dashboard stats:", e);
            return {
                totalBalance: "0",
                totalProposals: 0,
                pendingApprovals: 0,
                readyToExecute: 0,
                activeSigners: 0,
                threshold: "0/0"
            };
        }
    }, []);

    const proposeTransfer = async (recipient: string, token: string, amount: string, memo: string) => {
        if (!isConnected || !address) throw new Error("Wallet not connected");
        setLoading(true);
        try {
            const account = await server.getAccount(address);
            const tx = new TransactionBuilder(account, { fee: "100" })
                .setNetworkPassphrase(NETWORK_PASSPHRASE)
                .setTimeout(30)
                .addOperation(Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
                            functionName: "propose_transfer",
                            args: [
                                new Address(address).toScVal(),
                                new Address(recipient).toScVal(),
                                new Address(token).toScVal(),
                                nativeToScVal(BigInt(amount)),
                                xdr.ScVal.scvSymbol(memo),
                            ],
                        })
                    ),
                    auth: [],
                }))
                .build();

            const simulation = await server.simulateTransaction(tx);
            if (SorobanRpc.Api.isSimulationError(simulation)) throw new Error(`Simulation Failed: ${simulation.error}`);
            const preparedTx = SorobanRpc.assembleTransaction(tx, simulation).build();
            const signedXdr = await signTransaction(preparedTx.toXDR(), { network: "TESTNET" });
            const response = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr as string, NETWORK_PASSPHRASE));
            return response.hash;
        } catch (e: unknown) {
            throw parseError(e);
        } finally {
            setLoading(false);
        }
    };

    const rejectProposal = async (proposalId: number) => {
        if (!isConnected || !address) throw new Error("Wallet not connected");
        setLoading(true);
        try {
            const account = await server.getAccount(address);
            const tx = new TransactionBuilder(account, { fee: "100" })
                .setNetworkPassphrase(NETWORK_PASSPHRASE)
                .setTimeout(30)
                .addOperation(Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
                            functionName: "reject_proposal",
                            args: [
                                new Address(address).toScVal(),
                                nativeToScVal(BigInt(proposalId), { type: "u64" }),
                            ],
                        })
                    ),
                    auth: [],
                }))
                .build();

            const simulation = await server.simulateTransaction(tx);
            if (SorobanRpc.Api.isSimulationError(simulation)) throw new Error(`Simulation Failed: ${simulation.error}`);
            const preparedTx = SorobanRpc.assembleTransaction(tx, simulation).build();
            const signedXdr = await signTransaction(preparedTx.toXDR(), { network: "TESTNET" });
            const response = await server.sendTransaction(TransactionBuilder.fromXDR(signedXdr as string, NETWORK_PASSPHRASE));
            return response.hash;
        } catch (e: unknown) {
            throw parseError(e);
        } finally {
            setLoading(false);
        }
    };

    const executeProposal = async (proposalId: number) => {
        if (!isConnected || !address) {
            throw new Error("Wallet not connected");
        }

        setLoading(true);
        try {
            // 1. Get latest account data
            const account = await server.getAccount(address);

            // 2. Build Transaction
            const tx = new TransactionBuilder(account, { fee: "100" })
                .setNetworkPassphrase(NETWORK_PASSPHRASE)
                .setTimeout(30)
                .addOperation(Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
                            functionName: "execute_proposal",
                            args: [
                                new Address(address).toScVal(),
                                nativeToScVal(BigInt(proposalId), { type: "u64" }),
                            ],
                        })
                    ),
                    auth: [],
                }))
                .build();

            // 3. Simulate Transaction
            const simulation = await server.simulateTransaction(tx);
            if (SorobanRpc.Api.isSimulationError(simulation)) {
                throw new Error(`Simulation Failed: ${simulation.error}`);
            }

            // Assemble transaction with simulation data
            const preparedTx = SorobanRpc.assembleTransaction(tx, simulation).build();

            // 4. Sign with Freighter
            const signedXdr = await signTransaction(preparedTx.toXDR(), {
                network: "TESTNET",
            });

            // 5. Submit Transaction
            const response = await server.sendTransaction(
                TransactionBuilder.fromXDR(signedXdr as string, NETWORK_PASSPHRASE)
            );

            if (response.status !== "PENDING") {
                throw new Error("Transaction submission failed");
            }

            return response.hash;

        } catch (e: unknown) {
            const parsed = parseError(e);
            throw parsed;
        } finally {
            setLoading(false);
        }
    };

    const getVaultEvents = async (
        cursor?: string,
        limit: number = EVENTS_PAGE_SIZE
    ): Promise<GetVaultEventsResult> => {
        try {
            const latestLedgerRes = await fetch(RPC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }),
            });
            const latestLedgerData = await latestLedgerRes.json();
            const latestLedger = latestLedgerData?.result?.sequence ?? '0';
            const startLedger = cursor ? undefined : Math.max(1, parseInt(latestLedger, 10) - 50000);

            const params: Record<string, unknown> = {
                filters: [{ type: 'contract', contractIds: [CONTRACT_ID] }],
                pagination: { limit: Math.min(limit, 200) },
            };
            if (!cursor) params.startLedger = String(startLedger);
            else params.pagination = { ...(params.pagination as object), cursor };

            const res = await fetch(RPC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'getEvents', params }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error.message || 'getEvents failed');
            const events: RawEvent[] = data.result?.events ?? [];
            const resultCursor = data.result?.cursor;
            const hasMore = Boolean(resultCursor && events.length === limit);

            const activities: VaultActivity[] = events.map(ev => {
                const topic0 = ev.topic?.[0];
                const valueXdr = ev.value?.xdr;
                const eventType = topic0 ? getEventTypeFromTopic(topic0) : 'unknown';
                const { actor, details } = valueXdr ? parseEventValue(valueXdr, eventType) : { actor: '', details: {} };
                return {
                    id: ev.id,
                    type: eventType,
                    timestamp: ev.ledgerClosedAt || new Date().toISOString(),
                    ledger: ev.ledger,
                    actor,
                    details: { ...details, ledger: ev.ledger },
                    eventId: ev.id,
                    pagingToken: ev.pagingToken,
                };
            });

            return { activities, latestLedger: data.result?.latestLedger ?? latestLedger, cursor: resultCursor, hasMore };
        } catch (e) {
            console.error('getVaultEvents', e);
            return { activities: [], latestLedger: '0', hasMore: false };
        }
    };

    // ============ Recurring Payment Functions ============

    /**
     * Get all recurring payments for the vault
     */
    const getRecurringPayments = useCallback(async (): Promise<RecurringPayment[]> => {
        try {
            // Simulate contract call to get recurring payments
            // In production, this would call the actual contract
            await server.getAccount(CONTRACT_ID).catch(() => null);
            
            // Mock data for demonstration - in production this would parse contract storage
            const mockPayments: RecurringPayment[] = [
                {
                    id: '1',
                    recipient: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX1',
                    token: 'CDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                    amount: '1000000000', // 100 XLM (in stroops)
                    memo: 'Monthly salary',
                    interval: 2592000, // 30 days in seconds
                    nextPaymentTime: Date.now() + 86400000, // 1 day from now
                    totalPayments: 12,
                    status: 'active',
                    createdAt: Date.now() - 31536000000, // 1 year ago
                    creator: 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
                },
                {
                    id: '2',
                    recipient: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX2',
                    token: 'CDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                    amount: '500000000', // 50 XLM
                    memo: 'Weekly subscription',
                    interval: 604800, // 7 days in seconds
                    nextPaymentTime: Date.now() - 3600000, // 1 hour ago (due)
                    totalPayments: 52,
                    status: 'active',
                    createdAt: Date.now() - 15768000000, // 6 months ago
                    creator: 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
                },
                {
                    id: '3',
                    recipient: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX3',
                    token: 'CDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
                    amount: '250000000', // 25 XLM
                    memo: 'Paused service',
                    interval: 86400, // 1 day
                    nextPaymentTime: Date.now() + 86400000,
                    totalPayments: 5,
                    status: 'paused',
                    createdAt: Date.now() - 2592000000, // 30 days ago
                    creator: 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
                },
            ];

            return mockPayments;
        } catch (e) {
            console.error('Failed to fetch recurring payments:', e);
            return [];
        }
    }, []);

    /**
     * Get payment history for a specific recurring payment
     */
    const getRecurringPaymentHistory = useCallback(async (paymentId: string): Promise<RecurringPaymentHistory[]> => {
        try {
            // Mock data for demonstration
            const mockHistory: RecurringPaymentHistory[] = [
                {
                    id: `${paymentId}-1`,
                    paymentId,
                    executedAt: Date.now() - 2592000000, // 30 days ago
                    transactionHash: 'abc123def456789012345678901234567890123456789012345678901234',
                    amount: '1000000000',
                    success: true,
                },
                {
                    id: `${paymentId}-2`,
                    paymentId,
                    executedAt: Date.now() - 5184000000, // 60 days ago
                    transactionHash: 'def456abc789012345678901234567890123456789012345678901234567',
                    amount: '1000000000',
                    success: true,
                },
            ];

            return mockHistory;
        } catch (e) {
            console.error('Failed to fetch payment history:', e);
            return [];
        }
    }, []);

    /**
     * Schedule a new recurring payment
     */
    const schedulePayment = useCallback(async (params: CreateRecurringPaymentParams): Promise<string> => {
        if (!isConnected || !address) throw new Error("Wallet not connected");
        setLoading(true);
        try {
            const account = await server.getAccount(address);
            const tx = new TransactionBuilder(account, { fee: "100" })
                .setNetworkPassphrase(NETWORK_PASSPHRASE)
                .setTimeout(30)
                .addOperation(Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
                            functionName: "schedule_payment",
                            args: [
                                new Address(address).toScVal(),
                                new Address(params.recipient).toScVal(),
                                new Address(params.token).toScVal(),
                                nativeToScVal(BigInt(params.amount)),
                                xdr.ScVal.scvSymbol(params.memo),
                                nativeToScVal(BigInt(params.interval), { type: "u64" }),
                            ],
                        })
                    ),
                    auth: [],
                }))
                .build();

            const simulation = await server.simulateTransaction(tx);
            if (SorobanRpc.Api.isSimulationError(simulation)) {
                throw new Error(`Simulation Failed: ${simulation.error}`);
            }
            const preparedTx = SorobanRpc.assembleTransaction(tx, simulation).build();
            const signedXdr = await signTransaction(preparedTx.toXDR(), { network: "TESTNET" });
            const response = await server.sendTransaction(
                TransactionBuilder.fromXDR(signedXdr as string, NETWORK_PASSPHRASE)
            );

            return response.hash;
        } catch (e: unknown) {
            throw parseError(e);
        } finally {
            setLoading(false);
        }
    }, [address, isConnected]);

    /**
     * Execute a due recurring payment manually
     */
    const executeRecurringPayment = useCallback(async (paymentId: string): Promise<string> => {
        if (!isConnected || !address) throw new Error("Wallet not connected");
        setLoading(true);
        try {
            const account = await server.getAccount(address);
            const tx = new TransactionBuilder(account, { fee: "100" })
                .setNetworkPassphrase(NETWORK_PASSPHRASE)
                .setTimeout(30)
                .addOperation(Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
                            functionName: "execute_recurring_payment",
                            args: [
                                new Address(address).toScVal(),
                                nativeToScVal(BigInt(paymentId), { type: "u64" }),
                            ],
                        })
                    ),
                    auth: [],
                }))
                .build();

            const simulation = await server.simulateTransaction(tx);
            if (SorobanRpc.Api.isSimulationError(simulation)) {
                throw new Error(`Simulation Failed: ${simulation.error}`);
            }
            const preparedTx = SorobanRpc.assembleTransaction(tx, simulation).build();
            const signedXdr = await signTransaction(preparedTx.toXDR(), { network: "TESTNET" });
            const response = await server.sendTransaction(
                TransactionBuilder.fromXDR(signedXdr as string, NETWORK_PASSPHRASE)
            );

            return response.hash;
        } catch (e: unknown) {
            throw parseError(e);
        } finally {
            setLoading(false);
        }
    }, [address, isConnected]);

    /**
     * Cancel/Deactivate a recurring payment
     */
    const cancelRecurringPayment = useCallback(async (paymentId: string): Promise<string> => {
        if (!isConnected || !address) throw new Error("Wallet not connected");
        setLoading(true);
        try {
            const account = await server.getAccount(address);
            const tx = new TransactionBuilder(account, { fee: "100" })
                .setNetworkPassphrase(NETWORK_PASSPHRASE)
                .setTimeout(30)
                .addOperation(Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
                            functionName: "cancel_recurring_payment",
                            args: [
                                new Address(address).toScVal(),
                                nativeToScVal(BigInt(paymentId), { type: "u64" }),
                            ],
                        })
                    ),
                    auth: [],
                }))
                .build();

            const simulation = await server.simulateTransaction(tx);
            if (SorobanRpc.Api.isSimulationError(simulation)) {
                throw new Error(`Simulation Failed: ${simulation.error}`);
            }
            const preparedTx = SorobanRpc.assembleTransaction(tx, simulation).build();
            const signedXdr = await signTransaction(preparedTx.toXDR(), { network: "TESTNET" });
            const response = await server.sendTransaction(
                TransactionBuilder.fromXDR(signedXdr as string, NETWORK_PASSPHRASE)
            );

            return response.hash;
        } catch (e: unknown) {
            throw parseError(e);
        } finally {
            setLoading(false);
        }
    }, [address, isConnected]);

    /**
     * Pause a recurring payment
     */
    const pauseRecurringPayment = useCallback(async (paymentId: string): Promise<string> => {
        if (!isConnected || !address) throw new Error("Wallet not connected");
        setLoading(true);
        try {
            const account = await server.getAccount(address);
            const tx = new TransactionBuilder(account, { fee: "100" })
                .setNetworkPassphrase(NETWORK_PASSPHRASE)
                .setTimeout(30)
                .addOperation(Operation.invokeHostFunction({
                    func: xdr.HostFunction.hostFunctionTypeInvokeContract(
                        new xdr.InvokeContractArgs({
                            contractAddress: Address.fromString(CONTRACT_ID).toScAddress(),
                            functionName: "pause_recurring_payment",
                            args: [
                                new Address(address).toScVal(),
                                nativeToScVal(BigInt(paymentId), { type: "u64" }),
                            ],
                        })
                    ),
                    auth: [],
                }))
                .build();

            const simulation = await server.simulateTransaction(tx);
            if (SorobanRpc.Api.isSimulationError(simulation)) {
                throw new Error(`Simulation Failed: ${simulation.error}`);
            }
            const preparedTx = SorobanRpc.assembleTransaction(tx, simulation).build();
            const signedXdr = await signTransaction(preparedTx.toXDR(), { network: "TESTNET" });
            const response = await server.sendTransaction(
                TransactionBuilder.fromXDR(signedXdr as string, NETWORK_PASSPHRASE)
            );

            return response.hash;
        } catch (e: unknown) {
            throw parseError(e);
        } finally {
            setLoading(false);
        }
    }, [address, isConnected]);

    return { 
        proposeTransfer, 
        rejectProposal, 
        executeProposal, 
        getDashboardStats, 
        getVaultEvents,
        // Recurring payment functions
        getRecurringPayments,
        getRecurringPaymentHistory,
        schedulePayment,
        executeRecurringPayment,
        cancelRecurringPayment,
        pauseRecurringPayment,
        loading 
    };
};
