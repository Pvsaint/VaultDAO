import React, { useState, useEffect, useMemo, useCallback } from 'react'; // Added useCallback
import { useVaultContract } from '../../hooks/useVaultContract';
import ActivityItem from '../../components/ActivityItem';
import type { VaultActivity, VaultEventType } from '../../types/activity';
import { startOfDay, endOfDay } from '../../utils/dateUtils';

const ITEMS_PER_PAGE = 20;
const EVENT_TYPES: { value: VaultEventType; label: string }[] = [
    { value: 'proposal_created', label: 'Proposal Created' },
    { value: 'proposal_approved', label: 'Approved' },
    { value: 'proposal_executed', label: 'Executed' },
    { value: 'proposal_rejected', label: 'Rejected' },
    { value: 'signer_added', label: 'Signer Added' },
    { value: 'signer_removed', label: 'Signer Removed' },
    { value: 'config_updated', label: 'Config Updated' },
];

const Activity: React.FC = () => {
    const { getVaultEvents } = useVaultContract();
    const [activities, setActivities] = useState<VaultActivity[]>([]);
    const [loading, setLoading] = useState(true);
    const [cursor, setCursor] = useState<string | undefined>();
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(1);
    const [eventTypeFilter, setEventTypeFilter] = useState<VaultEventType[]>([]);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [actorSearch, setActorSearch] = useState('');

    // Wrapped in useCallback to fix the linting warning
    const loadEvents = useCallback(async (nextCursor?: string, append = false) => {
        setLoading(true);
        try {
            const result = await getVaultEvents(nextCursor, 100);
            setActivities((prev: VaultActivity[]) => (append ? [...prev, ...result.activities] : result.activities));
            setCursor(result.cursor);
            setHasMore(result.hasMore);
            if (!append) setPage(1);
        } catch (e) {
            console.error(e);
            if (!append) setActivities([]);
        } finally {
            setLoading(false);
        }
    }, [getVaultEvents]); // Dependency on the hook method

    useEffect(() => {
        loadEvents();
    }, [loadEvents]); // Now safe to include in the dependency array

    const filteredActivities = useMemo(() => {
        let list = [...activities];
        if (eventTypeFilter.length) {
            list = list.filter((a) => eventTypeFilter.includes(a.type));
        }
        if (startDate || endDate) {
            list = list.filter((a) => {
                const t = new Date(a.timestamp).getTime();
                if (startDate && t < startOfDay(startDate).getTime()) return false;
                if (endDate && t > endOfDay(endDate).getTime()) return false;
                return true;
            });
        }
        if (actorSearch.trim()) {
            const q = actorSearch.trim().toLowerCase();
            list = list.filter((a) => a.actor?.toLowerCase().includes(q));
        }
        return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [activities, eventTypeFilter, startDate, endDate, actorSearch]);

    const totalPages = Math.max(1, Math.ceil(filteredActivities.length / ITEMS_PER_PAGE));
    const paginatedActivities = useMemo(() => {
        const start = (page - 1) * ITEMS_PER_PAGE;
        return filteredActivities.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredActivities, page]);

    const toggleEventType = (t: VaultEventType) => {
        setEventTypeFilter((prev: VaultEventType[]) =>
            prev.includes(t) ? prev.filter((x: VaultEventType) => x !== t) : [...prev, t]
        );
    };

    const clearFilters = () => {
        setEventTypeFilter([]);
        setStartDate('');
        setEndDate('');
        setActorSearch('');
        setPage(1);
    };

    const hasActiveFilters = eventTypeFilter.length > 0 || startDate || endDate || actorSearch.trim() !== '';

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold">Activity</h2>
            <p className="text-gray-400">Vault actions and transaction history.</p>

            {/* Filters */}
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 md:p-5 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-400 w-full sm:w-auto">Event type:</span>
                    {EVENT_TYPES.map(({ value, label }) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => toggleEventType(value)}
                            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                eventTypeFilter.includes(value)
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">From date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">To date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Search by address</label>
                        <input
                            type="text"
                            placeholder="Address..."
                            value={actorSearch}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setActorSearch(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500"
                        />
                    </div>
                </div>
                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={clearFilters}
                        className="text-sm text-purple-400 hover:text-purple-300"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* Timeline */}
            <div className="relative">
                <div
                    className="absolute left-5 md:left-6 top-10 bottom-10 w-0.5 bg-gray-700 -translate-x-1/2 hidden sm:block"
                    aria-hidden
                />

                {loading && activities.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="animate-spin rounded-full h-10 w-10 border-2 border-purple-500 border-t-transparent" />
                    </div>
                ) : paginatedActivities.length === 0 ? (
                    <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
                        <p className="text-gray-400">No activities match your filters.</p>
                        <p className="text-sm text-gray-500 mt-1">
                            {hasActiveFilters ? 'Try clearing filters or load more.' : 'No vault events yet.'}
                        </p>
                        {hasActiveFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="mt-4 text-purple-400 hover:text-purple-300 text-sm"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="space-y-0">
                        {paginatedActivities.map((activity) => (
                            <li key={activity.id} className="relative">
                                <ActivityItem activity={activity} />
                            </li>
                        ))}
                    </ul>
                )}

                {loading && activities.length > 0 && (
                    <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-500 border-t-transparent" />
                    </div>
                )}
            </div>

            {/* Pagination */}
            {filteredActivities.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4">
                    <p className="text-sm text-gray-400">
                        Showing {(page - 1) * ITEMS_PER_PAGE + 1}–
                        {Math.min(page * ITEMS_PER_PAGE, filteredActivities.length)} of {filteredActivities.length}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                        >
                            Previous
                        </button>
                        <span className="text-sm text-gray-400">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            type="button"
                            onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-600"
                        >
                            Next
                        </button>
                    </div>
                    {hasMore && (
                        <button
                            type="button"
                            onClick={() => loadEvents(cursor, true)}
                            disabled={loading}
                            className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-50"
                        >
                            Load more
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default Activity;