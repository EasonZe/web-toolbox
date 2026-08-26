"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

const MOVE_TOLERANCE = 12;
const LONG_PRESS_DELAY = 460;
const ENTER_DELAY = 220;
const FEEDBACK_DURATION = 420;

type TouchGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
};

type ToolCardLinkProps = {
  children: ReactNode;
  external?: boolean;
  href: string;
  style?: CSSProperties;
};

export function ToolCardLink({
  children,
  external = false,
  href,
  style,
}: ToolCardLinkProps) {
  const router = useRouter();
  const gestureRef = useRef<TouchGesture | null>(null);
  const shortTapRef = useRef(false);
  const suppressClickRef = useRef(false);
  const navigationPendingRef = useRef(false);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTouchEntering, setIsTouchEntering] = useState(false);

  useEffect(
    () => () => {
      if (navigationTimerRef.current) {
        clearTimeout(navigationTimerRef.current);
      }
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    },
    [],
  );

  const resetFeedbackLater = () => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => {
      setIsTouchEntering(false);
    }, FEEDBACK_DURATION);
  };

  const scheduleInternalNavigation = () => {
    if (navigationPendingRef.current) {
      return;
    }

    navigationPendingRef.current = true;
    setIsTouchEntering(true);
    navigationTimerRef.current = setTimeout(() => {
      navigationTimerRef.current = null;
      router.push(href);
    }, ENTER_DELAY);
  };

  const handlePointerDown = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    shortTapRef.current = false;
    suppressClickRef.current = false;
    if (!navigationPendingRef.current) {
      setIsTouchEntering(false);
    }
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      moved: false,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLAnchorElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.moved) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
    );
    if (distance > MOVE_TOLERANCE) {
      gesture.moved = true;
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLAnchorElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const elapsed = event.timeStamp - gesture.startTime;
    const isShortTap = !gesture.moved && elapsed < LONG_PRESS_DELAY;

    gestureRef.current = null;
    shortTapRef.current = isShortTap;
    suppressClickRef.current = !isShortTap;

    if (isShortTap) {
      setIsTouchEntering(true);

      if (external) {
        resetFeedbackLater();
      } else {
        scheduleInternalNavigation();
      }
    }
  };

  const cancelGesture = () => {
    gestureRef.current = null;
    shortTapRef.current = false;
    suppressClickRef.current = false;
    if (!navigationPendingRef.current) {
      setIsTouchEntering(false);
    }
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      suppressClickRef.current = false;
      return;
    }

    if (navigationPendingRef.current) {
      event.preventDefault();
      return;
    }

    if (
      !shortTapRef.current ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    shortTapRef.current = false;

    if (external) {
      return;
    }

    event.preventDefault();
    scheduleInternalNavigation();
  };

  return (
    <Link
      className={`tool-card${isTouchEntering ? " is-touch-entering" : ""}`}
      draggable={false}
      href={href}
      onClick={handleClick}
      onPointerCancel={cancelGesture}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      rel={external ? "noopener noreferrer" : undefined}
      style={style}
      target={external ? "_blank" : undefined}
    >
      {children}
    </Link>
  );
}
