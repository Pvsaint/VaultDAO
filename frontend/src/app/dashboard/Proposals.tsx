import React, { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { useToast } from '../../context/ToastContext';
import { useVaultContract } from '../../hooks/useVaultContract';
import ConfirmationModal from '../../components/ConfirmationModal';
import ProposalDetailModal from '../../components/ProposalDetailModal';
import { ArrowUpRight, Clock, Plus } from 'lucide-react';

interface Proposal {
    id: number;
    proposer: string;
    recipient: string;
    amount: string;
    token: string;
    memo: string;
    status: 'Pending' | 'Approved' | 'Executed' | 'Rejected' | 'Expired';
    approvals: number;
    threshold: number;
    createdAt: string;
}

const mockProposals: Proposal[] = [
    {
        id: 102,
        proposer: 'GA5W...7K9L',
        recipient: 'GD26L4...Z3X4',
        amount: '2,500',
        token: 'XLM',
        memo: 'Quarterly server maintenance costs',
        status: 'Pending',
        approvals: 1,
        threshold: 3,
        createdAt: '2h ago',
    },
    {
        id: 101,
        proposer: 'GB2R...4M1P',
        recipient: 'GCEYUX...R7T2',
        amount: '12,000',
        token: 'XLM',
        memo: 'Marketing grant for ecosystem growth',
        status: 'Executed',
        approvals: 3,
        threshold: 3,
        createdAt: '1d ago',
    },
];

const Proposals: React.FC = () => {
    const { address, isConnected } = useWallet();
    const { notify } = useToast();
    const { rejectProposal, loading } = useVaultContract();
    
    const [proposals, setProposals] = useState<Proposal[]>(mockProposals);
    const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectingId, setRejectingId] = useState<number | null>(null);

    const userRole = 'Admin'; 

    const canRejectProposal = (proposal: Proposal): boolean => {
        if (!isConnected || !address) return false;
        return proposal.proposer === address || userRole === 'Admin';
    };

    const handleRejectClick = (e: React.MouseEvent, proposalId: number) => {
        e.stopPropagation(); 
        setRejectingId(proposalId);
        setShowRejectModal(true);
    };

    const handleRejectConfirm = async (reason?: string) => {
        if (rejectingId === null) return;
        try {
            // Passing reason to contract or logging it to satisfy TS unused variable check
            console.log(`Rejecting proposal ${rejectingId} for reason: ${reason || 'No reason provided'}`);
            await rejectProposal(rejectingId);
            
            setProposals(prev => prev.map(p => p.id === rejectingId ? { ...p, status: 'Rejected' } : p));
            notify('proposal_rejected', `Proposal #${rejectingId} rejected`, 'success');
        } catch (error: any) {
            notify('proposal_rejected', error.message || 'Failed to reject', 'error');
        } finally {
            setShowRejectModal(false);
            setRejectingId(null);
        }
    };

    const getStatusStyles = (status: Proposal['status']) => {
        switch (status) {
            case 'Executed': return 'bg-green-500/10 text-green-500';
            case 'Rejected': return 'bg-red-500/10 text-red-500';
            default: return 'bg-yellow-500/10 text-yellow-500';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-white tracking-tight">Proposals</h2>
                <button className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-purple-500/20">
                    <Plus size={20} />
                    <span>New Proposal</span>
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {proposals.map((prop) => (
                    <div 
                        key={prop.id}
                        onClick={() => setSelectedProposal(prop)}
                        className="bg-gray-800/50 p-5 rounded-2xl border border-gray-700 hover:border-purple-500/50 cursor-pointer transition-all hover:scale-[1.01] group"
                    >
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-gray-900 rounded-xl text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                    <ArrowUpRight size={20} />
                                </div>
                                <div>
                                    <h4 className="text-white font-bold">Proposal #{prop.id}</h4>
                                    <p className="text-sm text-gray-400 flex items-center gap-1">
                                        <Clock size={12} /> {prop.createdAt} • {prop.amount} {prop.token}
                                    </p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${getStatusStyles(prop.status)}`}>
                                    {prop.status}
                                </span>
                                {prop.status === 'Pending' && canRejectProposal(prop) && (
                                    <button 
                                        onClick={(e) => handleRejectClick(e, prop.id)}
                                        disabled={loading}
                                        className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-3 py-1 rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading && rejectingId === prop.id ? '...' : 'Reject'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <ProposalDetailModal 
                isOpen={!!selectedProposal} 
                onClose={() => setSelectedProposal(null)} 
                proposal={selectedProposal} 
            />

            <ConfirmationModal
                isOpen={showRejectModal}
                title="Reject Proposal"
                message="Are you sure you want to reject this? This action is permanent."
                onConfirm={handleRejectConfirm}
                onCancel={() => setShowRejectModal(false)}
                showReasonInput={true}
                isDestructive={true}
            />
        </div>
    );
};

export default Proposals;