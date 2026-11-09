from pathlib import Path
import shutil
root=Path(__file__).parent
shutil.copytree(root/"src",root/"docs",dirs_exist_ok=True)
(root/"docs/app.js").write_text((root/"src/legacy.js").read_text()+"\n"+(root/"src/km-chart.js").read_text()+"\n"+(root/"src/compact-charts.js").read_text()+"\n"+(root/"src/online.js").read_text().replace("authScreen();openSession().catch(e=>authScreen('login',friendly(e)));",(root/"src/driver-ui.js").read_text()+"\nauthScreen();openSession().catch(e=>authScreen('login',friendly(e)));"))
print("Build pronto")
