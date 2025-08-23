import { useEffect, useRef, useState } from 'react';

// const GQL_URL = "https://arweave-search.goldsky.com/graphql";
const GQL_URL = "https://arweave.net/graphql";
const PENDING_URL = "https://arweave.net/tx/pending";

export default function TxnTable() {
  const [txns, setTxns] = useState([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [rowHeight, setRowHeight] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [error, setError] = useState(null);
  const tbodyRef = useRef(null);
  const [maxTxShown, setMaxTxShown] = useState(10);
  const [startIndex, setStartIndex] = useState(0);
  const BUFFER_MULTIPLIER = 4; // keep extra items in memory beyond what we render
  
  // Move seen sets to component state to prevent persistence across re-renders
  const [seenPending, setSeenPending] = useState(new Set());
  const [seenMined, setSeenMined] = useState(new Set());

  // Measure the visual step distance between adjacent rows (top-to-top)
  function measureStep() {
    const tbody = tbodyRef.current;
    if (!tbody) return 0;
    const rows = tbody.querySelectorAll('tr');
    if (!rows || rows.length < 2) return 0;
    const top0 = rows[0].getBoundingClientRect().top;
    const top1 = rows[1].getBoundingClientRect().top;
    return top1 - top0;
  }

  async function getLatestMined(limit = 10) {
    const query = `
      query {
        transactions(first: ${limit}, sort: HEIGHT_DESC) {
          edges {
            node {
              id
              owner { address }
              block { height timestamp }
              tags { name value }
              data {
                size
              }
            }
          }
        }
      }
    `;

    try {
      const res = await fetch(GQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const json = await res.json();
      
      if (!json.data?.transactions?.edges) {
        console.warn("Unexpected response format from GraphQL API");
        return [];
      }
      
      return json.data.transactions.edges.map(e => e.node);
    } catch (error) {
      console.error("Error fetching mined transactions:", error);
      return [];
    }
  }

  async function getPendingTransactions() {
    try {
      const res = await fetch(PENDING_URL);
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const ids = await res.json();
      if (!Array.isArray(ids) || ids.length === 0) return [];

      // Look up details for the first few pending TXs
      const query = `
        query {
          transactions(ids: [${ids.slice(0, 5).map(id => `"${id}"`).join(", ")}]) {
            edges {
              node {
                id
                owner { address }
                tags { name value }
                data {
                  size
                }
              }
            }
          }
        }
      `;

      const gqlRes = await fetch(GQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      if (!gqlRes.ok) {
        throw new Error(`HTTP error! status: ${gqlRes.status}`);
      }

      const json = await gqlRes.json();
      
      if (!json.data?.transactions?.edges) {
        console.warn("Unexpected response format from GraphQL API for pending transactions");
        return [];
      }
      
      return json.data.transactions.edges.map(e => e.node);
    } catch (error) {
      console.error("Error fetching pending transactions:", error);
      return [];
    }
  }

  function formatSize(size) {
    if (!size || size < 1024) {
      return `${size || 0} B`;
    }
    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`;
    }
    if (size < 1024 * 1024 * 1024) {
      return `${(size / 1024 / 1024).toFixed(2)} MB`;
    }
    return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  function tsToRelativeTime(ts, currentTime) {
    if (!ts) return 'Unknown';
    
    const diff = currentTime - ts * 1000; // Convert from seconds to milliseconds
    const seconds = Math.floor(diff / 1000);

    if (seconds < 0) return 'Just now';
    if (seconds < 60) {
      return `${seconds} second${seconds !== 1 ? 's' : ''} ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }

  // Helper function to sort transactions deterministically
  // Order: items WITH timestamps first (newest to oldest),
  // tie-break by blockHeight (desc), then by id (asc).
  // Items WITHOUT timestamps come after, sorted by id (asc).
  function sortTransactionsByTime(transactions) {
    return transactions.sort((a, b) => {
      const aHasTs = typeof a.timestamp === 'number' && !Number.isNaN(a.timestamp);
      const bHasTs = typeof b.timestamp === 'number' && !Number.isNaN(b.timestamp);

      // Items with timestamps come first
      if (aHasTs && !bHasTs) return -1;
      if (!aHasTs && bHasTs) return 1;

      if (aHasTs && bHasTs) {
        // Primary: timestamp desc (newest first)
        if (b.timestamp !== a.timestamp) return b.timestamp - a.timestamp;
        // Secondary: blockHeight desc if available
        const aH = typeof a.blockHeight === 'number' ? a.blockHeight : -Infinity;
        const bH = typeof b.blockHeight === 'number' ? b.blockHeight : -Infinity;
        if (bH !== aH) return bH - aH;
        // Tertiary: id asc for stability
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      }

      // Neither has timestamp: sort by id asc for determinism
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
  }

  // Helper function to merge and deduplicate transactions
  function mergeAndDeduplicateTransactions(mined, pending, currentTxns) {
    const allTxns = [...currentTxns];
    
    // Add new mined transactions
    for (const tx of mined) {
      if (!seenMined.has(tx.id)) {
        seenMined.add(tx.id);
        allTxns.push({
          id: tx.id,
          size: tx.data?.size || 0,
          timestamp: tx.block?.timestamp || null,
          owner: tx.owner?.address,
          blockHeight: tx.block?.height,
          tags: tx.tags || [],
          status: 'mined'
        });
      }
    }
    
    // Add new pending transactions
    for (const tx of pending) {
      if (!seenPending.has(tx.id)) {
        seenPending.add(tx.id);
        allTxns.push({
          id: tx.id,
          size: tx.data?.size || 0,
          timestamp: null, // Pending transactions don't have a block timestamp
          owner: tx.owner?.address,
          blockHeight: null,
          tags: tx.tags || [],
          status: 'pending'
        });
      }
    }
    
    // Sort by timestamp (newest first), pending transactions go to the top
    const sorted = sortTransactionsByTime(allTxns);
    
    // Update seen sets
    setSeenMined(new Set(seenMined));
    setSeenPending(new Set(seenPending));
    
    return sorted.slice(0, maxTxShown);
  }

  useEffect(() => {
    if(typeof window === 'undefined') return;
    const handleResize = () => {
      setMaxTxShown(window.innerWidth < 1024 ? 6 : 10);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Live time updates every second
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(timeInterval);
  }, []);

  // Initial load of transactions
  useEffect(() => {
    const loadInitialTxns = async () => {
      setIsLoading(true);
      setShowContent(false);
      try {
        const [minedRes, pendingRes] = await Promise.allSettled([
          getLatestMined(maxTxShown * BUFFER_MULTIPLIER),
          getPendingTransactions()
        ]);

        const minedTransactions = minedRes.status === 'fulfilled' ? minedRes.value : [];
        const pendingTransactions = pendingRes.status === 'fulfilled' ? pendingRes.value : [];

        const formattedMined = minedTransactions.map(tx => ({
          id: tx.id,
          size: tx.data?.size || 0,
          timestamp: tx.block?.timestamp || null,
          owner: tx.owner?.address,
          blockHeight: tx.block?.height,
          tags: tx.tags || [],
          status: 'mined'
        }));

        const formattedPending = pendingTransactions.map(tx => ({
          id: tx.id,
          size: tx.data?.size || 0,
          timestamp: null, // Pending transactions don't have a block timestamp
          owner: tx.owner?.address,
          blockHeight: null,
          tags: tx.tags || [],
          status: 'pending'
        }));

        // Merge and sort by timestamp (newest first); keep a larger buffer in memory
        const allTxns = sortTransactionsByTime([...formattedMined, ...formattedPending])
          .slice(0, maxTxShown * BUFFER_MULTIPLIER);
        
        setTxns(allTxns);
        // Start from an older item so the carousel can move toward newest
        setStartIndex(Math.min(Math.max(allTxns.length - 1, 0), Math.max(maxTxShown, 0)));

        // Add to seen transactions
        const newSeenMined = new Set();
        const newSeenPending = new Set();
        
        formattedMined.forEach(tx => newSeenMined.add(tx.id));
        formattedPending.forEach(tx => newSeenPending.add(tx.id));
        
        setSeenMined(newSeenMined);
        setSeenPending(newSeenPending);
        setError(null); // Clear any previous errors on success
      } catch (error) {
        console.error("Error loading initial transactions:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialTxns();
  }, [maxTxShown]);

  // Trigger fade-in when loading completes; keep mounted to allow transition
  useEffect(() => {
    if (!isLoading) {
      setShowContent(false);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setShowContent(true));
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isLoading]);

  // Poll for new transactions
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const [mined, pending] = await Promise.all([
          getLatestMined(maxTxShown),
          getPendingTransactions()
        ]);

        const newTxns = [];

        // Check for new mined transactions
        for (const tx of mined) {
          if (!seenMined.has(tx.id)) {
            seenMined.add(tx.id);
            newTxns.push({
              id: tx.id,
              size: tx.data?.size || 0,
              timestamp: tx.block?.timestamp || null,
              owner: tx.owner?.address,
              blockHeight: tx.block?.height,
              tags: tx.tags || [],
              status: 'mined'
            });
          }
        }

        // Check for new pending transactions
        for (const tx of pending) {
          if (!seenPending.has(tx.id)) {
            seenPending.add(tx.id);
            newTxns.push({
              id: tx.id,
              size: tx.data?.size || 0,
              timestamp: null, // Pending transactions don't have a block timestamp
              owner: tx.owner?.address,
              blockHeight: null,
              tags: tx.tags || [],
              status: 'pending'
            });
          }
        }

        if (newTxns.length > 0) {
          setTxns(prev => {
            const merged = sortTransactionsByTime([...newTxns, ...prev])
              .slice(0, maxTxShown * BUFFER_MULTIPLIER);
            // Keep the current visible top row unchanged visually by advancing startIndex
            setStartIndex(si => (merged.length > 0 ? (si + newTxns.length) % merged.length : 0));
            setError(null);
            return merged;
          });
        }
      } catch (error) {
        console.error("Error polling transactions:", error);
      }
    }, 10000); // Poll every 10 seconds instead of 5 to reduce API load

    return () => clearInterval(pollInterval);
  }, [maxTxShown, seenMined, seenPending]);

  // Continuous carousel: rotate one row periodically toward newest (index 0)
  useEffect(() => {
    let cancelled = false;
    const animationDurationMs = 500; // how long the movement takes
    const cycleIntervalMs = 300; // how often to move to next row (shorter interval)

    const tick = () => {
      if (cancelled) return;
      if (txns.length < 2) return; // nothing to cycle

      const measuredRowHeight = measureStep();
      if (!measuredRowHeight) return;
      if (measuredRowHeight !== rowHeight) setRowHeight(measuredRowHeight);

      // Animate from -rowHeight to 0
      setIsAnimating(true);
      setTranslateY(0);

      setTimeout(() => {
        if (cancelled) return;
        // Decrement startIndex to move toward index 0 (newest)
        setStartIndex(prev => (txns.length > 0 ? (prev - 1 + txns.length) % txns.length : 0));
        // Disable transition and snap back to -rowHeight on next frame to avoid jitter
        setIsAnimating(false);
        requestAnimationFrame(() => {
          if (cancelled) return;
          setTranslateY(-measuredRowHeight);
          if (!cancelled) setTimeout(tick, cycleIntervalMs);
        });
      }, animationDurationMs);
    };

    // Start the cycle shortly after mount/loading
    const startId = setTimeout(tick, cycleIntervalMs);
    return () => {
      cancelled = true;
      clearTimeout(startId);
    };
  }, [txns.length, rowHeight]);

  // Measure step distance when data changes
  useEffect(() => {
    const measuredRowHeight = measureStep();
    if (measuredRowHeight && measuredRowHeight !== rowHeight) {
      setRowHeight(measuredRowHeight);
    }
  }, [txns.length]);

  // Ensure we start offset by -rowHeight when not animating
  useEffect(() => {
    if (!isAnimating && rowHeight) {
      setTranslateY(-rowHeight);
    }
  }, [rowHeight, isAnimating]);

  // Keep component mounted during loading and on errors to enable fade-in

  return (
    <div className={`relative w-full mt-auto mb-6 overflow-hidden text-xxs transition-opacity duration-500 ${showContent ? 'opacity-100' : 'opacity-0'}`} style={{
      willChange: 'opacity',
    }}>
      {/* Top/Bottom overlay gradients for edge fade */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 h-20 z-10 bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-64 z-10 bg-gradient-to-t from-white to-transparent" />
      {/* Mobile view - stacked cards */}
      <div
        className="block lg:hidden space-y-3"
      >
        {txns.length > 0 && Array.from({ length: txns.length }).map((_, i) => {
          const txn = txns[(startIndex + i) % txns.length];
          const classes = ['bg-white border-b border-gray-100 p-4 hover:border-orange-300 transition-all duration-300'];
          const cardClass = classes.join(' ');

          return (
            <div
              key={`${txn.id}-${txn.status}-${i}`}
              className={cardClass}
              onClick={() => window.open(`https://arweave.net/${txn.id}`, '_blank')}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500">{tsToRelativeTime(txn.timestamp, currentTime)}</span>
                <span className={`px-2 py-1`}>
                  {txn.status === 'pending' ? 'Pending' : 'Mined'}
                </span>
              </div>
              
              <div className="font-mono mb-2">
                {txn.id.slice(0, 12)}...{txn.id.slice(-12)}
              </div>
              
              <div className="text-gray-600">
                Size: {formatSize(txn.size)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop view - table */}
      <div
        className="hidden lg:block overflow-x-auto text-xxs"
      >
        <div className="h-[75vh] overflow-hidden">
          <table className="min-w-full table-fixed border-separate border-spacing-y-2">
            <tbody
              ref={tbodyRef}
              style={{
                transform: `translateY(${translateY}px)`,
                transition: isAnimating ? 'transform 500ms ease-in-out' : 'none',
                willChange: isAnimating ? 'transform' : 'auto',
              }}
              className='whitespace-nowrap'
            >
            {/* Prepend buffer row to create seamless top entry */}
            {txns.length > 0 && (() => {
              const total = txns.length;
              const txn = txns[(startIndex - 1 + total) % total];
              const classes = ['hover:bg-orange/5', 'cursor-pointer', 'transition-all', 'duration-300'];
              const rowClass = classes.join(' ');
              return (
                <tr
                  key={`buffer-${txn.id}-${txn.status}`}
                  className={rowClass}
                  onClick={() => window.open(`https://arweave.net/${txn.id}`, '_blank')}
                >
                  {/* <td className="py-3 px-4 text-right font-mono text-gray-500">
                    {txn.status === 'mined' && txn.blockHeight ? txn.blockHeight : '—'}
                  </td> */}
                  <td className="py-3 pl-4 font-mono text-gray-500 text-left w-1/4">
                    <div className="flex items-center gap-2">
                      <span>{txn.id.slice(0, 10)}...{txn.id.slice(-10)}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-gray-900 w-1/4">{formatSize(txn.size)}</td>
                  <td className="py-3 px-4 text-right w-1/4">
                    <span className={`px-2 py-1`}>
                      {txn.status === 'pending' ? 'Pending' : 'Mined'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500 w-1/4">{tsToRelativeTime(txn.timestamp, currentTime)}</td>
                </tr>
              );
            })()}

            {txns.length > 0 && Array.from({ length: txns.length }).map((_, i) => {
              const txn = txns[(startIndex + i) % txns.length];
              const classes = ['hover:bg-orange/5', 'cursor-pointer', 'transition-all', 'duration-300'];
              const rowClass = classes.join(' ');

              return (
                <tr
                  key={`${txn.id}-${txn.status}-${i}`}
                  className={rowClass}
                  onClick={() => window.open(`https://arweave.net/${txn.id}`, '_blank')}
                >
                  {/* <td className="py-3 px-4 text-right font-mono text-gray-500">
                    {txn.status === 'mined' && txn.blockHeight ? txn.blockHeight : '—'}
                  </td> */}
                  <td className="py-3 pl-4 font-mono text-gray-500 text-left w-1/4">
                    <div className="flex items-center gap-2">
                      <span>{txn.id.slice(0, 10)}...{txn.id.slice(-10)}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-gray-900 w-1/4">{formatSize(txn.size)}</td>
                  <td className="py-3 px-4 text-right w-1/4">
                    <span className={`px-2 py-1`}>
                      {txn.status === 'pending' ? 'Pending' : 'Mined'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-gray-500 w-1/4">{tsToRelativeTime(txn.timestamp, currentTime)}</td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


