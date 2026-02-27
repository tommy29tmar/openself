"use client";

import React, { useState, useRef, useEffect } from "react";

type CollapsibleListProps = {
    items: React.ReactNode[];
    summaryLine: string;
    threshold?: number;
};

export function CollapsibleList({ items, summaryLine, threshold = 3 }: CollapsibleListProps) {
    const [expanded, setExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [contentHeight, setContentHeight] = useState(0);

    useEffect(() => {
        if (contentRef.current) {
            setContentHeight(contentRef.current.scrollHeight);
        }
    }, [expanded, items]);

    if (items.length < threshold) {
        return <>{items}</>;
    }

    const firstItem = items[0];
    const restItems = items.slice(1);

    return (
        <div>
            {firstItem}
            {!expanded && (
                <button
                    onClick={() => setExpanded(true)}
                    className="mt-4 flex items-center gap-2 text-sm text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors cursor-pointer group"
                >
                    <span className="text-xs">&#9660;</span>
                    <span className="border-b border-transparent group-hover:border-[var(--page-fg)] transition-colors">
                        {summaryLine}
                    </span>
                </button>
            )}
            <div
                ref={contentRef}
                style={{
                    maxHeight: expanded ? `${contentHeight}px` : "0px",
                    overflow: "hidden",
                    transition: "max-height 0.4s ease-in-out",
                }}
            >
                {restItems}
            </div>
            {expanded && (
                <button
                    onClick={() => setExpanded(false)}
                    className="mt-4 flex items-center gap-2 text-sm text-[var(--page-fg-secondary)] hover:text-[var(--page-fg)] transition-colors cursor-pointer group"
                >
                    <span className="text-xs">&#9650;</span>
                    <span className="border-b border-transparent group-hover:border-[var(--page-fg)] transition-colors">
                        Collapse
                    </span>
                </button>
            )}
        </div>
    );
}
