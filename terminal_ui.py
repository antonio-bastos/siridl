
from time import monotonic
from collections.abc import Iterable
from typing import TypeVar

from rich.console import Console
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from rich.table import Table
from rich.theme import Theme

T = TypeVar("T")

console = Console(
    theme=Theme({
        "success": "bold green",
        "warning": "bold yellow",
        "error": "bold red",
        "info": "cyan",
    })
)


def banner(title: str, description: str = "") -> None:
    console.print()
    console.print(
        Panel(
            f"[bold]{title}[/bold]"
            + (f"\n[dim]{description}[/dim]" if description else ""),
            border_style="cyan",
            expand=False,
        )
    )


def make_progress() -> Progress:
    return Progress(
        SpinnerColumn(),
        TextColumn("[bold cyan]{task.description}"),
        BarColumn(bar_width=None),
        MofNCompleteColumn(),
        TextColumn("•"),
        TextColumn("{task.percentage:>3.0f}%"),
        TextColumn("•"),
        TimeElapsedColumn(),
        TextColumn("elapsed"),
        TextColumn("•"),
        TimeRemainingColumn(),
        console=console,
        transient=False,
    )


def process_items(
    description: str,
    items: Iterable[T],
    callback,
) -> list:
    """Run callback(item) for each item, showing progress and ETA."""
    items = list(items)
    results = []
    started = monotonic()

    with make_progress() as progress:
        task = progress.add_task(description, total=len(items))

        for item in items:
            results.append(callback(item))
            progress.advance(task)

    elapsed = monotonic() - started
    rate = len(items) / elapsed if elapsed else 0

    console.print(
        f"[success]Completed[/success] {len(items):,} items "
        f"in {elapsed:.1f}s ({rate:.1f} items/s)"
    )
    return results


def print_stats(title: str, stats: dict[str, int | float | str]) -> None:
    table = Table(title=title, show_header=True, header_style="bold cyan")
    table.add_column("Metric")
    table.add_column("Value", justify="right")

    for key, value in stats.items():
        if isinstance(value, float):
            rendered = f"{value:,.2f}"
        elif isinstance(value, int):
            rendered = f"{value:,}"
        else:
            rendered = str(value)

        table.add_row(key, rendered)

    console.print(table)


def success(message: str) -> None:
    console.print(f"[success]✓[/success] {message}")


def warning(message: str) -> None:
    console.print(f"[warning]![/warning] {message}")


def error(message: str) -> None:
    console.print(f"[error]✗[/error] {message}")