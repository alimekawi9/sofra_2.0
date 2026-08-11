"use client";
import Link from "next/link";
import { useState } from "react";
import { sv2Display, sv2Sans } from "./fonts";
import {
  PREVIEW_MENU_COURSES,
  PreviewMenuCandidate,
  PreviewMenuCourse,
} from "./menu-fixtures";
import { PreviewBottomNav } from "./PreviewBottomNav";
const exportOptions = [
  "Ornate menu",
  "Minimal menu",
  "Portrait",
  "Landscape",
  "Printable menu",
  "Shareable image",
  "PDF-style preview",
];
function CourseEditor({
  course,
  onChange,
}: {
  course: PreviewMenuCourse;
  onChange: (course: PreviewMenuCourse) => void;
}) {
  const [swapping, setSwapping] = useState(false),
    [custom, setCustom] = useState(false),
    [draft, setDraft] = useState("");
  function choose(candidate: PreviewMenuCandidate) {
    onChange({
      ...course,
      selectedCandidate: candidate,
      locked: false,
      customOverride: undefined,
    });
    setSwapping(false);
  }
  return (
    <section
      className={`sv2-course-editor ${course.locked ? "sv2-course-locked" : ""}`}
    >
      <div className="sv2-course-status">
        <p>{course.section}</p>
        <span>{course.locked ? "LOCKED" : "PROPOSED"}</span>
      </div>
      <h2>{course.customOverride ?? course.selectedCandidate.name}</h2>
      <span>
        {course.customOverride
          ? "Host-created course"
          : course.selectedCandidate.description}
      </span>
      <small>{course.selectedCandidate.indicator}</small>
      <div className="sv2-course-actions">
        <button
          type="button"
          onClick={() => onChange({ ...course, locked: !course.locked })}
        >
          {course.locked ? "UNLOCK" : "LOCK IN"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSwapping((value) => !value);
            setCustom(false);
          }}
        >
          SWAP
        </button>
        <button
          type="button"
          onClick={() => {
            setCustom((value) => !value);
            setSwapping(false);
          }}
        >
          ENTER MY OWN
        </button>
      </div>
      {swapping && (
        <div
          className="sv2-swap-candidates"
          role="region"
          aria-label={`Alternatives for ${course.section}`}
        >
          {course.alternateCandidates.map((candidate) => (
            <button
              type="button"
              key={candidate.name}
              onClick={() => choose(candidate)}
            >
              <strong>{candidate.name}</strong>
              <span>{candidate.description}</span>
            </button>
          ))}
        </div>
      )}
      {custom && (
        <form
          className="sv2-custom-course"
          onSubmit={(event) => {
            event.preventDefault();
            const value = draft.trim();
            if (value) {
              onChange({ ...course, customOverride: value, locked: false });
              setCustom(false);
              setDraft("");
            }
          }}
        >
          <input
            aria-label={`Custom dish for ${course.section}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Name your dish"
          />
          <button type="submit">USE THIS DISH</button>
        </form>
      )}
    </section>
  );
}
export function CuratedMenusPreview({
  detail = false,
  eventContext = false,
}: {
  detail?: boolean;
  eventContext?: boolean;
}) {
  const [courses, setCourses] = useState<PreviewMenuCourse[]>(() =>
      PREVIEW_MENU_COURSES.map((course) => ({
        ...course,
        alternateCandidates: [...course.alternateCandidates] as [
          PreviewMenuCandidate,
          PreviewMenuCandidate,
        ],
      })),
    ),
    [finalized, setFinalized] = useState(false),
    [exporting, setExporting] = useState(false),
    [choice, setChoice] = useState("Ornate menu"),
    [confirmed, setConfirmed] = useState(false);
  function update(index: number, course: PreviewMenuCourse) {
    setFinalized(false);
    setCourses((current) =>
      current.map((value, i) => (i === index ? course : value)),
    );
  }
  const allLocked = courses.every((course) => course.locked);
  return (
    <div
      className={`sv2-root sv2-device-page sv2-app-page ${sv2Display.variable} ${sv2Sans.variable}`}
    >
      <main className="sv2-device-shell sv2-app-shell sv2-menu-shell">
        <header className="sv2-menu-topline">
          <p>Sofra.</p>
        </header>
        {detail ? (
          <article className="sv2-curated-detail">
            <Link
              className="sv2-back-link"
              href={
                eventContext
                  ? "/design-preview/events/demo?role=host"
                  : "/design-preview/curated-menus"
              }
            >
              ← {eventContext ? "Host event" : "Curated Menus"}
            </Link>
            <p className="sv2-event-kicker">
              MENU PROPOSAL · LAYLA&apos;S SOFRA
            </p>
            <h1>Curate tonight&apos;s table</h1>
            {courses.map((course, index) => (
              <CourseEditor
                key={course.slot}
                course={course}
                onChange={(value) => update(index, value)}
              />
            ))}
            <button
              className="sv2-finalize-menu"
              type="button"
              disabled={!allLocked}
              onClick={() => setFinalized(true)}
            >
              FINALIZE MENU
            </button>
            {!allLocked && (
              <p className="sv2-menu-lock-hint">
                Lock every course before finalizing.
              </p>
            )}
            {finalized && (
              <button
                className="sv2-export-menu"
                type="button"
                onClick={() => setExporting(true)}
              >
                EXPORT MENU
              </button>
            )}
            {exporting && (
              <section
                className="sv2-export-chooser"
                aria-label="Menu export customization"
              >
                <h2>Choose your menu</h2>
                <p>Based on the Sofra customization frames.</p>
                <div>
                  {exportOptions.map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-pressed={choice === option}
                      onClick={() => setChoice(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmed(true);
                    setExporting(false);
                  }}
                >
                  THAT ONE
                </button>
              </section>
            )}
            {confirmed && (
              <p className="sv2-local-confirmation" role="status">
                {choice} prepared in this preview.
              </p>
            )}
            {eventContext && (
              <Link
                className="sv2-hosting-return"
                href="/design-preview/events?tab=hosting"
              >
                BACK TO HOSTING
              </Link>
            )}
          </article>
        ) : (
          <section className="sv2-curated-index">
            <p className="sv2-event-kicker">YOUR COLLECTION</p>
            <h1>Curated Menus</h1>
            <article>
              <p>READY TO CURATE</p>
              <h2>Tonight&apos;s proposal</h2>
              <span>Layla&apos;s Sofra · {courses.length} courses</span>
              <Link href="/design-preview/curated-menus/demo">
                Open curated menu →
              </Link>
            </article>
          </section>
        )}
        <PreviewBottomNav current="events" />
      </main>
    </div>
  );
}
