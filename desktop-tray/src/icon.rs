use crate::model::{PlatformStatus, TrayPlatformSnapshot};
use anyhow::Result;
use image::{Rgba, RgbaImage};
use tray_icon::Icon;

const ICON_SIZE: u32 = 32;
const BAR_WIDTH: u32 = 7;
const BAR_GAP: u32 = 3;
const BAR_BOTTOM: u32 = 28;
const BAR_TOP: u32 = 4;

pub fn build_icon(platforms: &[TrayPlatformSnapshot]) -> Result<Icon> {
    let mut image = RgbaImage::from_pixel(ICON_SIZE, ICON_SIZE, Rgba([0, 0, 0, 0]));
    let enabled_platforms = platforms
        .iter()
        .filter(|platform| platform.enabled)
        .take(3)
        .collect::<Vec<_>>();

    if enabled_platforms.is_empty() {
        draw_empty_icon(&mut image);
    } else {
        let bar_count = enabled_platforms.len() as u32;
        let total_width = bar_count * BAR_WIDTH + (bar_count.saturating_sub(1)) * BAR_GAP;
        let start_left = (ICON_SIZE.saturating_sub(total_width)) / 2;

        for (index, platform) in enabled_platforms.iter().enumerate() {
            let left = start_left + index as u32 * (BAR_WIDTH + BAR_GAP);
            draw_bar(&mut image, left, platform);
        }
    }

    Ok(Icon::from_rgba(image.into_raw(), ICON_SIZE, ICON_SIZE)?)
}

fn draw_bar(image: &mut RgbaImage, left: u32, platform: &TrayPlatformSnapshot) {
    let height = ((platform
        .remaining_percentage
        .unwrap_or(0.0)
        .clamp(0.0, 100.0)
        / 100.0)
        * f64::from(BAR_BOTTOM - BAR_TOP)) as u32;
    let top = BAR_BOTTOM.saturating_sub(height);
    let color = color_for(platform);
    let frame = Rgba([76, 76, 76, 220]);

    for x in left..left + BAR_WIDTH {
        for y in BAR_TOP..=BAR_BOTTOM {
            let pixel = if y == BAR_TOP || y == BAR_BOTTOM || x == left || x == left + BAR_WIDTH - 1
            {
                frame
            } else if y >= top && platform.enabled {
                color
            } else {
                Rgba([40, 40, 40, 140])
            };
            image.put_pixel(x, y, pixel);
        }
    }
}

fn draw_empty_icon(image: &mut RgbaImage) {
    let color = Rgba([148, 163, 184, 210]);
    for x in 9..23 {
        for y in 15..18 {
            image.put_pixel(x, y, color);
        }
    }
}

fn color_for(platform: &TrayPlatformSnapshot) -> Rgba<u8> {
    match platform.status {
        PlatformStatus::Ok => Rgba([34, 197, 94, 255]),
        PlatformStatus::Warning => Rgba([234, 179, 8, 255]),
        PlatformStatus::Danger => Rgba([239, 68, 68, 255]),
        PlatformStatus::NotLogin | PlatformStatus::Error => Rgba([148, 163, 184, 255]),
    }
}
