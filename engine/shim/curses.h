/*
 * curses.h -- a tiny in-memory replacement for the parts of curses that
 * Rogue 5.4.4 uses. Every window is a grid of cells; wrefresh() copies a
 * window onto one global 80x24 screen that the web page reads directly.
 */
#ifndef SHIM_CURSES_H
#define SHIM_CURSES_H

#include <stdio.h>
#include <stdarg.h>
#include <stdbool.h>

typedef unsigned int chtype;

#define OK   0
#define ERR  (-1)

#ifndef TRUE
#define TRUE 1
#endif
#ifndef FALSE
#define FALSE 0
#endif

#define A_CHARTEXT 0x0ff
#define A_STANDOUT 0x100

#define KEY_MIN    0401
#define KEY_DOWN   0402
#define KEY_UP     0403
#define KEY_LEFT   0404
#define KEY_RIGHT  0405
#define KEY_HOME   0406
#define KEY_NPAGE  0522
#define KEY_PPAGE  0523
#define KEY_END    0550
#define KEY_A1     0534
#define KEY_A3     0535
#define KEY_B1     0537
#define KEY_B3     0540
#define KEY_C1     0541
#define KEY_C3     0542
#define KEY_A2     0543
#define KEY_C2     0546
#define KEY_LL     0533
#define KEY_SLEFT  0611
#define KEY_SRIGHT 0622
#define KEY_SHOME  0607
#define KEY_SEND   0602
#define KEY_EOL    0517
#define KEY_B2     0544
#define KEY_SPREVIOUS 0616
#define KEY_SNEXT  0615

#define SHIM_ROWS 24
#define SHIM_COLS 80

typedef struct _win_st {
    int _cury, _curx;
    int _maxy, _maxx;
    int _begy, _begx;
    chtype *_base;      /* first cell of this window */
    int _stride;        /* cells per row in the backing store */
    int _own;           /* 1 if _base was allocated for this window */
    chtype _attr;
    int _dirty;         /* changed since the last wrefresh(); getch() flushes stdscr */
} WINDOW;

extern WINDOW *stdscr, *curscr;
extern int LINES, COLS;

WINDOW *initscr(void);
int endwin(void);
WINDOW *newwin(int lines, int cols, int y, int x);
WINDOW *subwin(WINDOW *parent, int lines, int cols, int y, int x);
int delwin(WINDOW *w);

int wmove(WINDOW *w, int y, int x);
int waddch(WINDOW *w, chtype c);
int waddstr(WINDOW *w, const char *s);
int wprintw(WINDOW *w, const char *fmt, ...);
int mvwprintw(WINDOW *w, int y, int x, const char *fmt, ...);
int mvprintw(int y, int x, const char *fmt, ...);
int printw(const char *fmt, ...);
int wclrtoeol(WINDOW *w);
int wclear(WINDOW *w);
int werase(WINDOW *w);
chtype winch(WINDOW *w);
int wstandout(WINDOW *w);
int wstandend(WINDOW *w);
int wrefresh(WINDOW *w);
int touchwin(WINDOW *w);
int clearok(WINDOW *w, int f);
int overwrite(WINDOW *src, WINDOW *dst);

#define move(y, x)           wmove(stdscr, (y), (x))
#define addch(c)             waddch(stdscr, (c))
#define addstr(s)            waddstr(stdscr, (s))
#define mvaddch(y, x, c)     (wmove(stdscr, (y), (x)), waddch(stdscr, (c)))
#define mvwaddch(w, y, x, c) (wmove((w), (y), (x)), waddch((w), (c)))
#define mvaddstr(y, x, s)    (wmove(stdscr, (y), (x)), waddstr(stdscr, (s)))
#define clrtoeol()           wclrtoeol(stdscr)
#define clear()              wclear(stdscr)
#define erase()              werase(stdscr)
#define inch()               winch(stdscr)
#define mvinch(y, x)         (wmove(stdscr, (y), (x)), winch(stdscr))
#define mvwinch(w, y, x)     (wmove((w), (y), (x)), winch(w))
#define standout()           wstandout(stdscr)
#define standend()           wstandend(stdscr)
#define refresh()            wrefresh(stdscr)
#define getyx(w, y, x)       ((y) = (w)->_cury, (x) = (w)->_curx)

int getch(void);
int wgetnstr(WINDOW *w, char *buf, int n);
int mvwin(WINDOW *w, int y, int x);
int isendwin(void);
int halfdelay(int tenths);
const char *unctrl(chtype c);
#define getmaxx(w) ((w)->_maxx)
#define getmaxy(w) ((w)->_maxy)
int raw(void);
int noraw(void);
int cbreak(void);
int nocbreak(void);
int echo(void);
int noecho(void);
int nl(void);
int nonl(void);
int keypad(WINDOW *w, int f);
int leaveok(WINDOW *w, int f);
int idlok(WINDOW *w, int f);
int flushinp(void);
int typeahead(int fd);
int baudrate(void);
int mvcur(int oy, int ox, int ny, int nx);
char erasechar(void);
char killchar(void);

#endif
