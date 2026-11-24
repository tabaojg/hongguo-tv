package main

import "testing"

// Automatic quality must reach full-HD when the source offers it. The cap used
// to be 720p, which silently downgraded capable TVs/projectors to 720p even
// when a 1080p rendition was available.
func TestChooseMiniReelOptionAutomaticPrefers1080p(t *testing.T) {
	options := []miniReelOption{
		{Quality: "480P", Height: 480},
		{Quality: "720P", Height: 720},
		{Quality: "1080P", Height: 1080},
	}
	selected := chooseMiniReelOption(options)
	if selected.Quality != "1080P" || selected.Height != 1080 {
		t.Fatalf("automatic quality = %s (%dp), want 1080P", selected.Quality, selected.Height)
	}
}

// A 1080p cap still wins when only SD/HD options exist.
func TestChooseMiniReelOptionAutomaticPicksHighestAtOrBelowCap(t *testing.T) {
	options := []miniReelOption{
		{Quality: "480P", Height: 480},
		{Quality: "720P", Height: 720},
	}
	selected := chooseMiniReelOption(options)
	if selected.Quality != "720P" {
		t.Fatalf("automatic quality = %s, want 720P", selected.Quality)
	}
}

// When every rendition exceeds the cap (e.g. 4K-only), the uncapped set is the
// fallback so automatic still returns a playable option rather than nothing.
func TestChooseMiniReelOptionAutomaticFallsBackAboveCap(t *testing.T) {
	options := []miniReelOption{
		{Quality: "2160P", Height: 2160},
		{Quality: "1440P", Height: 1440},
	}
	selected := chooseMiniReelOption(options)
	if selected.Quality != "2160P" {
		t.Fatalf("automatic quality = %s, want highest available 2160P", selected.Quality)
	}
}

// Options without a known height are ignored while any measurable option is
// present, matching the pre-existing behaviour.
func TestChooseMiniReelOptionAutomaticIgnoresUnknownHeight(t *testing.T) {
	options := []miniReelOption{
		{Quality: "", Height: 0},
		{Quality: "1080P", Height: 1080},
	}
	selected := chooseMiniReelOption(options)
	if selected.Quality != "1080P" {
		t.Fatalf("automatic quality = %s, want 1080P", selected.Quality)
	}
}

// Explicit quality selection remains untouched by the automatic cap.
func TestSelectMiniReelQualityExplicitStillHonoured(t *testing.T) {
	options := []miniReelOption{
		{Quality: "480P", Height: 480},
		{Quality: "1080P", Height: 1080},
	}
	selected, err := selectMiniReelQuality(options, "480P", false)
	if err != nil || selected.Quality != "480P" {
		t.Fatalf("explicit 480P = %s, err=%v", selected.Quality, err)
	}
}
