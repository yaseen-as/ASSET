import { useState, useRef, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SymbolResult {
  symbol: string;
  exchange: string;
  token: string;
  tradingSymbol: string;
  instrumentType: string;
  lotSize: number;
}

interface SymbolSearchProps {
  onSelect: (result: SymbolResult) => void;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}

export default function SymbolSearch({ onSelect, defaultValue = '', placeholder = 'Search symbol...', className }: SymbolSearchProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await api.get(`/broker/symbols/search?q=${encodeURIComponent(q)}&limit=10`);
      setResults(data.data || []);
      setIsOpen(true);
      setSelectedIndex(-1);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 300);
  };

  const handleSelect = (result: SymbolResult) => {
    setQuery(`${result.exchange}:${result.symbol}`);
    setIsOpen(false);
    onSelect(result);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          className="input pl-9 pr-8"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setIsOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-xl">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-gray-500">Searching...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">No symbols found</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.exchange}:${r.token}`}
                onClick={() => handleSelect(r)}
                className={cn(
                  'flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-gray-700',
                  selectedIndex === i && 'bg-gray-700',
                )}
              >
                <div>
                  <span className="font-medium text-gray-100">{r.symbol}</span>
                  <span className="ml-2 text-xs text-gray-500">{r.tradingSymbol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-600 px-1.5 py-0.5 text-xs text-gray-300">{r.exchange}</span>
                  <span className="text-xs text-gray-500">{r.instrumentType}</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
