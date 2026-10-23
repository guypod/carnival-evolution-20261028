# Synthetic workflow calibration repository

This tiny dependency-free repository tests the ticket-to-PR workflow, not Carnival coding ability.
Read the fake issue and implement only its request. Before finishing, run `replay-test check` and
`replay-test build`. Run both again after merging the base. Do not alter test scripts, this guide,
or files outside the requested scope. Tests execute real Python assertions; output is not stubbed.
Every service/Git shell command must run through the supplied `resources/replay/enter.sh` entry shell.
The only authorized service identity is the synthetic `replay-bot` supplied by the adapter.
