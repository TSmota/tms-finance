"use client";

import type { ReactNode } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";

interface IconButtonProps {
  /** Serve ao leitor de tela e ao tooltip: um rótulo só, sem chance de divergir. */
  label: string;
  onClick: () => void;
  children: ReactNode;
  color?: string;
  loading?: boolean;
  disabled?: boolean;
}

/** Ação representada só por ícone. O tooltip é o que revela o rótulo a quem vê. */
export function IconButton(props: IconButtonProps) {
  const { label, onClick, children, color = "gray", loading, disabled } = props;

  return (
    <Tooltip label={label} withArrow>
      <ActionIcon
        variant="subtle"
        color={color}
        aria-label={label}
        loading={loading}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </ActionIcon>
    </Tooltip>
  );
}
