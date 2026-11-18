/** Reuse Chrome's native wheel input to scroll the actual element under the
 * pointer, including page layouts with nested scroll owners. Policy validation
 * (finite delta and +/-1800) stays in cleanStep before this function is called.
 */
export async function scrollRemotePage(page,y,dispatch=command=>command()) {
  const viewport=page.viewport();
  if(viewport && viewport.width > 0 && viewport.height > 0) {
    await dispatch(()=>page.mouse.move(Math.floor(viewport.width / 2),Math.floor(viewport.height / 2)));
  }
  await dispatch(()=>page.mouse.wheel({deltaY:y}));
}
