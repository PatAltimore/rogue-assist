#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include "curses.h"

int LINES = SHIM_ROWS, COLS = SHIM_COLS;
WINDOW *stdscr, *curscr;

/* The one physical screen. The page reads this through shim_screen(). */
static chtype screen[SHIM_ROWS * SHIM_COLS];
static int screen_cy, screen_cx;
int shim_overlay;   /* last wrefresh() was a window other than stdscr (inventory, help...) */

EMSCRIPTEN_KEEPALIVE chtype *shim_screen(void) { return screen; }
EMSCRIPTEN_KEEPALIVE int shim_cursor_y(void) { return screen_cy; }
EMSCRIPTEN_KEEPALIVE int shim_cursor_x(void) { return screen_cx; }

#define CELL(w, y, x) ((w)->_base[(y) * (w)->_stride + (x)])

static WINDOW *alloc_win(int lines, int cols, int y, int x)
{
    WINDOW *w = calloc(1, sizeof *w);
    w->_maxy = lines;
    w->_maxx = cols;
    w->_begy = y;
    w->_begx = x;
    return w;
}

static void fill_blank(WINDOW *w)
{
    int r, c;
    for (r = 0; r < w->_maxy; r++)
        for (c = 0; c < w->_maxx; c++)
            CELL(w, r, c) = ' ';
}

WINDOW *newwin(int lines, int cols, int y, int x)
{
    WINDOW *w = alloc_win(lines, cols, y, x);
    w->_base = malloc(sizeof(chtype) * lines * cols);
    w->_stride = cols;
    w->_own = 1;
    fill_blank(w);
    return w;
}

WINDOW *subwin(WINDOW *p, int lines, int cols, int y, int x)
{
    WINDOW *w = alloc_win(lines, cols, y, x);
    w->_base = &CELL(p, y - p->_begy, x - p->_begx);
    w->_stride = p->_stride;
    return w;
}

int delwin(WINDOW *w)
{
    if (w == NULL || w == stdscr || w == curscr)
        return OK;
    if (w->_own)
        free(w->_base);
    free(w);
    return OK;
}

static void game_exited(void)
{
    EM_ASM({ if (Module.rogueExited) Module.rogueExited(); });
}

WINDOW *initscr(void)
{
    if (stdscr == NULL) {
        atexit(game_exited);
        int i;
        stdscr = newwin(SHIM_ROWS, SHIM_COLS, 0, 0);
        curscr = alloc_win(SHIM_ROWS, SHIM_COLS, 0, 0);
        curscr->_base = screen;
        curscr->_stride = SHIM_COLS;
        for (i = 0; i < SHIM_ROWS * SHIM_COLS; i++)
            screen[i] = ' ';
    }
    return stdscr;
}

int endwin(void) { return OK; }

int wmove(WINDOW *w, int y, int x)
{
    if (y < 0 || y >= w->_maxy || x < 0 || x >= w->_maxx)
        return ERR;
    w->_cury = y;
    w->_curx = x;
    w->_dirty = 1;
    return OK;
}

int waddch(WINDOW *w, chtype c)
{
    int ch = c & A_CHARTEXT;

    w->_dirty = 1;

    if (ch == '\n') {
        wclrtoeol(w);
        w->_curx = 0;
        if (w->_cury < w->_maxy - 1)
            w->_cury++;
        return OK;
    }
    if (ch == '\r') {
        w->_curx = 0;
        return OK;
    }
    if (ch == '\b') {
        if (w->_curx > 0)
            w->_curx--;
        return OK;
    }
    if (ch == '\t') {
        int n = 8 - (w->_curx % 8);
        while (n-- > 0)
            waddch(w, ' ');
        return OK;
    }
    if (w->_curx >= w->_maxx) {
        w->_curx = 0;
        if (w->_cury < w->_maxy - 1)
            w->_cury++;
    }
    CELL(w, w->_cury, w->_curx) = ch | (c & A_STANDOUT) | w->_attr;
    w->_curx++;
    return OK;
}

int waddstr(WINDOW *w, const char *s)
{
    while (*s)
        waddch(w, (unsigned char)*s++);
    return OK;
}

static int vwprint(WINDOW *w, const char *fmt, va_list ap)
{
    char buf[1024];
    vsnprintf(buf, sizeof buf, fmt, ap);
    return waddstr(w, buf);
}

int wprintw(WINDOW *w, const char *fmt, ...)
{
    va_list ap;
    int r;
    va_start(ap, fmt);
    r = vwprint(w, fmt, ap);
    va_end(ap);
    return r;
}

int printw(const char *fmt, ...)
{
    va_list ap;
    int r;
    va_start(ap, fmt);
    r = vwprint(stdscr, fmt, ap);
    va_end(ap);
    return r;
}

int mvwprintw(WINDOW *w, int y, int x, const char *fmt, ...)
{
    va_list ap;
    int r;
    wmove(w, y, x);
    va_start(ap, fmt);
    r = vwprint(w, fmt, ap);
    va_end(ap);
    return r;
}

int mvprintw(int y, int x, const char *fmt, ...)
{
    va_list ap;
    int r;
    wmove(stdscr, y, x);
    va_start(ap, fmt);
    r = vwprint(stdscr, fmt, ap);
    va_end(ap);
    return r;
}

int wclrtoeol(WINDOW *w)
{
    int c;
    w->_dirty = 1;
    for (c = w->_curx; c < w->_maxx; c++)
        CELL(w, w->_cury, c) = ' ';
    return OK;
}

int wclear(WINDOW *w)
{
    w->_dirty = 1;
    fill_blank(w);
    w->_cury = w->_curx = 0;
    return OK;
}

int werase(WINDOW *w) { return wclear(w); }

chtype winch(WINDOW *w) { return CELL(w, w->_cury, w->_curx); }

int wstandout(WINDOW *w) { w->_attr = A_STANDOUT; return OK; }
int wstandend(WINDOW *w) { w->_attr = 0; return OK; }

int wrefresh(WINDOW *w)
{
    int r, c;

    if (w == curscr)
        return OK;
    w->_dirty = 0;
    shim_overlay = (w != stdscr);
    for (r = 0; r < w->_maxy; r++) {
        for (c = 0; c < w->_maxx; c++) {
            int sy = w->_begy + r, sx = w->_begx + c;
            if (sy < SHIM_ROWS && sx < SHIM_COLS)
                screen[sy * SHIM_COLS + sx] = CELL(w, r, c);
        }
    }
    screen_cy = w->_begy + w->_cury;
    screen_cx = w->_begx + w->_curx;
    curscr->_cury = screen_cy;
    curscr->_curx = screen_cx;
    return OK;
}

int overwrite(WINDOW *src, WINDOW *dst)
{
    int r, c;
    for (r = 0; r < src->_maxy && r < dst->_maxy; r++)
        for (c = 0; c < src->_maxx && c < dst->_maxx; c++)
            CELL(dst, r, c) = CELL(src, r, c);
    return OK;
}

int touchwin(WINDOW *w) { w->_dirty = 1; return OK; }
int clearok(WINDOW *w, int f) { (void)w; (void)f; return OK; }
int raw(void) { return OK; }
int noraw(void) { return OK; }
int cbreak(void) { return OK; }
int nocbreak(void) { return OK; }
int echo(void) { return OK; }
int noecho(void) { return OK; }
int nl(void) { return OK; }
int nonl(void) { return OK; }
int keypad(WINDOW *w, int f) { (void)w; (void)f; return OK; }
int leaveok(WINDOW *w, int f) { (void)w; (void)f; return OK; }
int idlok(WINDOW *w, int f) { (void)w; (void)f; return OK; }
int typeahead(int fd) { (void)fd; return OK; }
int baudrate(void) { return 38400; }
int mvcur(int oy, int ox, int ny, int nx) { (void)oy; (void)ox; (void)ny; (void)nx; return OK; }
char erasechar(void) { return '\b'; }
char killchar(void) { return 21; }

/* Keyboard: the page queues keys; getch() suspends (ASYNCIFY) until one arrives. */
EM_ASYNC_JS(int, shim_wait_key, (void), {
    return await Module.rogueWaitKey();
});

int flushinp(void)
{
    EM_ASM({ if (Module.rogueFlushKeys) Module.rogueFlushKeys(); });
    return OK;
}

int mvwin(WINDOW *w, int y, int x) { w->_begy = y; w->_begx = x; return OK; }
int isendwin(void) { return FALSE; }
int halfdelay(int tenths) { (void)tenths; return OK; }

const char *unctrl(chtype c)
{
    static char buf[4];
    c &= A_CHARTEXT;
    if (c < 32) {
        buf[0] = '^'; buf[1] = c + '@'; buf[2] = 0;
    } else if (c == 127) {
        buf[0] = '^'; buf[1] = '?'; buf[2] = 0;
    } else {
        buf[0] = c; buf[1] = 0;
    }
    return buf;
}

/* Line input with echo, for the tombstone name prompt. */
int wgetnstr(WINDOW *w, char *buf, int n)
{
    int len = 0, k;

    for (;;) {
        wrefresh(w);
        k = getch();
        if (k == 10 || k == 13)
            break;
        if ((k == 8 || k == 127) && len > 0) {
            len--;
            w->_curx--;
            waddch(w, ' ');
            w->_curx--;
        } else if (k >= 32 && k < 127 && len < n - 1) {
            buf[len++] = k;
            waddch(w, k);
        }
    }
    buf[len] = 0;
    return OK;
}

/* Cheat keycodes from the page arrive as 0x1000 + code. */
extern void assist_cheat(int code);

int getch(void)
{
    int k;

    /* Like real curses, getch() first flushes any pending stdscr changes. */
    if (stdscr && stdscr->_dirty)
        wrefresh(stdscr);
    for (;;) {
        k = shim_wait_key();
        if (k < 0x1000)
            return k;
        assist_cheat(k - 0x1000);
    }
}
